from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from database.schema import (
    MenuItem,
    MenuPhoto,
    MobileOrder,
    OrderItem,
    MenuSettings,
    MobileOrderSettings,
    Order,
    OrderDelivery,
    OrderStatus,
    Store,
)

from .schemas import (
    PLATE,
    DeliveryBody,
    DeliveryItem,
    DeliveryList,
    DeliveryState,
    CarOrder,
    CarPage,
    LineOut,
    Ordering,
    PlaceOrder,
    PlacedOrder,
    MenuBody,
    MenuItemBody,
    MenuResponse,
    MobileSettings,
    MobileSettingsResponse,
    PublicMenu,
    normalize_plate,
)

ACTIVE = (OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY)


class MobileService:
    def __init__(self, db: Session):
        self.db = db

    # --- settings -----------------------------------------------------------------------------

    def get_settings(self, store_id: UUID) -> MobileSettingsResponse:
        row = self.db.get(MobileOrderSettings, store_id)
        if row is None:
            return MobileSettingsResponse(
                store_id=store_id, enabled=False, collect_enabled=True, car_enabled=False,
                table_enabled=False, table_count=0, hours_mode="always", opens="08:00", closes="22:00",
            )
        return MobileSettingsResponse.model_validate(row, from_attributes=True)

    def save_settings(self, store_id: UUID, body: MobileSettings) -> MobileSettingsResponse:
        row = self.db.get(MobileOrderSettings, store_id)
        if row is None:
            row = MobileOrderSettings(store_id=store_id)
            self.db.add(row)
        for key, value in body.model_dump().items():
            setattr(row, key, value)
        row.updated_at = datetime.now(ZoneInfo("UTC"))
        self.db.commit()
        return self.get_settings(store_id)

    def _open_now(self, store_id: UUID, s: MobileSettingsResponse) -> bool:
        if s.hours_mode == "always":
            return True
        store = self.db.get(Store, store_id)
        now = datetime.now(ZoneInfo(store.timezone if store and store.timezone else "UTC")).strftime("%H:%M")
        if s.opens <= s.closes:
            return s.opens <= now < s.closes
        return now >= s.opens or now < s.closes  # past midnight

    # --- the customer's choice ----------------------------------------------------------------

    def state(self, order: Order) -> DeliveryState:
        s = self.get_settings(order.store_id)
        row = self.db.get(OrderDelivery, order.id)
        on = s.enabled and self._open_now(order.store_id, s)
        return DeliveryState(
            available=on and (s.collect_enabled or s.car_enabled or s.table_enabled),
            collect=on and s.collect_enabled,
            car=on and s.car_enabled,
            table=on and s.table_enabled,
            mode=row.mode if row else None,
            car_plate=row.car_plate if row else None,
            car_note=row.car_note if row else None,
            car_color=row.car_color if row else None,
            car_model=row.car_model if row else None,
            table_label=row.table_label if row else None,
        )

    def choose(self, order: Order, body: DeliveryBody) -> DeliveryState:
        st = self.state(order)
        if order.status not in ACTIVE:
            raise HTTPException(status_code=409, detail="This order is already finished")
        if not getattr(st, body.mode):
            raise HTTPException(status_code=409, detail="The café doesn't offer that option right now")

        plate, note, label, color, model = self._clean(body)

        row = self.db.get(OrderDelivery, order.id)
        if row is None:
            row = OrderDelivery(order_id=order.id, store_id=order.store_id, mode=body.mode)
            self.db.add(row)
        row.mode, row.car_plate, row.car_note, row.table_label = body.mode, plate, note, label
        row.car_color, row.car_model = color, model
        row.updated_at = datetime.now(ZoneInfo("UTC"))
        self.db.commit()
        return self.state(order)

    @staticmethod
    def _clean(body):
        """Plate, note, table, colour and model, checked and tidied, for the way chosen."""
        plate = note = label = color = model = None
        if body.mode == "car":
            plate = normalize_plate(body.car_plate or "")
            if not PLATE.match(plate):
                raise HTTPException(status_code=422, detail="Enter a valid plate, like 34 ABC 123")
            note = " ".join((body.car_note or "").split()) or None
            color = (body.car_color or "").strip().lower() or None
            model = " ".join((body.car_model or "").split()) or None
        elif body.mode == "table":
            label = " ".join((body.table_label or "").split())
            if not label:
                raise HTTPException(status_code=422, detail="Enter your table")
        return plate, note, label, color, model

    def deliveries(self, store_id: UUID) -> DeliveryList:
        rows = self.db.scalars(
            select(OrderDelivery)
            .join(Order, Order.id == OrderDelivery.order_id)
            .where(OrderDelivery.store_id == store_id, Order.status.in_(ACTIVE))
        ).all()
        ids = [r.order_id for r in rows]
        mobile = {
            m.order_id: m
            for m in self.db.scalars(select(MobileOrder).where(MobileOrder.order_id.in_(ids)))
        } if ids else {}
        lines: dict = {}
        if ids:
            for it in self.db.scalars(select(OrderItem).where(OrderItem.order_id.in_(ids))):
                lines.setdefault(it.order_id, []).append(LineOut(name=it.name, qty=it.qty))
        out = []
        for r in rows:
            m = mobile.get(r.order_id)
            out.append(
                DeliveryItem(
                    order_id=r.order_id, mode=r.mode, car_plate=r.car_plate,
                    car_note=r.car_note, table_label=r.table_label,
                    car_color=r.car_color, car_model=r.car_model,
                    phone_order=m is not None,
                    customer_name=m.customer_name if m else "",
                    note=m.note if m else "",
                    total_cents=m.total_cents if m else 0,
                    lines=lines.get(r.order_id, []),
                )
            )
        return DeliveryList(items=out)

    # --- menu ---------------------------------------------------------------------------------

    def _items(self, store_id: UUID) -> list[MenuItemBody]:
        rows = self.db.scalars(
            select(MenuItem).where(MenuItem.store_id == store_id).order_by(MenuItem.position)
        ).all()
        with_photo = set(self.db.scalars(select(MenuPhoto.item_id).where(MenuPhoto.store_id == store_id)))
        return [
            MenuItemBody(
                id=r.id, category=r.category, name=r.name, description=r.description,
                price_cents=r.price_cents, available=r.available, has_photo=r.id in with_photo,
            )
            for r in rows
        ]

    def get_menu(self, store_id: UUID) -> MenuResponse:
        s = self.db.get(MenuSettings, store_id)
        return MenuResponse(
            store_id=store_id,
            enabled=bool(s and s.enabled),
            currency=s.currency if s else "₺",
            note=s.note if s else "",
            items=self._items(store_id),
        )

    def save_menu(self, store_id: UUID, body: MenuBody) -> MenuResponse:
        s = self.db.get(MenuSettings, store_id)
        if s is None:
            s = MenuSettings(store_id=store_id)
            self.db.add(s)
        s.enabled, s.currency, s.note = body.enabled, body.currency.strip() or "₺", body.note.strip()
        # The list is saved as sent: same order, same ids where the row already existed.
        self.db.execute(delete(MenuItem).where(MenuItem.store_id == store_id))
        for position, it in enumerate(body.items):
            self.db.add(
                MenuItem(
                    **({"id": it.id} if it.id else {}),
                    store_id=store_id,
                    category=" ".join(it.category.split()),
                    name=" ".join(it.name.split()),
                    description=" ".join(it.description.split()),
                    price_cents=it.price_cents,
                    available=it.available,
                    position=position,
                )
            )
        self.db.flush()
        # Photos of items that were removed from the menu go with them.
        keep = [it.id for it in body.items if it.id]
        self.db.execute(
            delete(MenuPhoto).where(MenuPhoto.store_id == store_id, MenuPhoto.item_id.not_in(keep))
            if keep
            else delete(MenuPhoto).where(MenuPhoto.store_id == store_id)
        )
        self.db.commit()
        return self.get_menu(store_id)

    # --- photos ---------------------------------------------------------------------------------

    def put_photo(self, store_id: UUID, item_id: UUID, data: bytes) -> MenuResponse:
        from modules.stores.services import sniff_image

        item = self.db.get(MenuItem, item_id)
        if item is None or item.store_id != store_id:
            raise HTTPException(status_code=404, detail="Item not found. Save the menu first.")
        if len(data) > 1024 * 1024:
            raise HTTPException(status_code=413, detail="Photo is larger than 1 MB")
        kind = sniff_image(data)
        if kind is None:
            raise HTTPException(status_code=415, detail="Use a PNG, JPEG or WebP image")
        row = self.db.get(MenuPhoto, item_id)
        if row is None:
            row = MenuPhoto(item_id=item_id, store_id=store_id, content_type=kind, data=data)
            self.db.add(row)
        row.content_type, row.data = kind, data
        row.updated_at = datetime.now(ZoneInfo("UTC"))
        self.db.commit()
        return self.get_menu(store_id)

    def delete_photo(self, store_id: UUID, item_id: UUID) -> MenuResponse:
        row = self.db.get(MenuPhoto, item_id)
        if row is not None and row.store_id == store_id:
            self.db.delete(row)
            self.db.commit()
        return self.get_menu(store_id)

    def get_photo(self, store_id: UUID, item_id: UUID) -> MenuPhoto:
        row = self.db.get(MenuPhoto, item_id)
        if row is None or row.store_id != store_id:
            raise HTTPException(status_code=404, detail="No photo")
        return row

    def public_menu(self, store_id: UUID) -> PublicMenu:
        store = self.db.get(Store, store_id)
        if store is None:
            raise HTTPException(status_code=404, detail="Not found")
        menu = self.get_menu(store_id)
        s = self.get_settings(store_id)
        on = menu.enabled and s.enabled and self._open_now(store_id, s)
        return PublicMenu(
            ordering=Ordering(
                available=on and (s.collect_enabled or s.car_enabled or s.table_enabled),
                collect=on and s.collect_enabled,
                car=on and s.car_enabled,
                table=on and s.table_enabled,
            ),
            store_name=store.name,
            enabled=menu.enabled,
            currency=menu.currency,
            note=menu.note,
            items=menu.items if menu.enabled else [],
        )

    # --- ordering from the menu -----------------------------------------------------------------

    def _new_phone_order(self, store: Store) -> Order:
        from modules.orders.schemas import OrderCreate
        from modules.orders.services import OrderService

        today = datetime.now(ZoneInfo(store.timezone)).date()
        for _ in range(4):
            top = self.db.scalar(
                select(func.max(Order.order_number)).where(
                    Order.store_id == store.id, Order.order_date == today
                )
            ) or 0
            # Phone orders count up from 1001, so they never clash with numbers the till types.
            number = max(top, 1000) + 1
            try:
                return OrderService(self.db).create_order(OrderCreate(store_id=store.id, order_number=number))
            except HTTPException as err:
                if err.status_code != 409:
                    raise
        raise HTTPException(status_code=409, detail="Busy right now, try again")

    def car_page(self, store_id: UUID) -> CarPage:
        store = self.db.get(Store, store_id)
        if store is None:
            raise HTTPException(status_code=404, detail="Not found")
        s = self.get_settings(store_id)
        menu = self.db.get(MenuSettings, store_id)
        return CarPage(
            store_name=store.name,
            available=s.enabled and s.car_enabled and self._open_now(store_id, s),
            menu_url_enabled=bool(menu and menu.enabled),
        )

    def car_order(self, store_id: UUID, body: CarOrder) -> PlacedOrder:
        from modules.qr.services import QRService

        store = self.db.get(Store, store_id)
        if store is None:
            raise HTTPException(status_code=404, detail="Not found")
        if not self.car_page(store_id).available:
            raise HTTPException(status_code=409, detail="The café isn't serving to cars right now")
        what = " ".join(body.what.split())
        plate, note, _, color, model = self._clean(
            type("B", (), {"mode": "car", "car_plate": body.car_plate, "car_note": body.car_note,
                           "car_color": body.car_color, "table_label": None, "car_model": body.car_model})()
        )

        if body.order_number is not None:
            today = datetime.now(ZoneInfo(store.timezone)).date()
            order = self.db.scalar(
                select(Order)
                .where(
                    Order.store_id == store_id, Order.order_date == today,
                    Order.order_number == body.order_number, Order.status.in_(ACTIVE),
                )
                .order_by(Order.created_at.desc())
            )
            if order is None:
                raise HTTPException(status_code=404, detail="We can't find that order number today")
        else:
            if not what:
                raise HTTPException(status_code=422, detail="Tell us what you'd like")
            order = self._new_phone_order(store)

        m = self.db.get(MobileOrder, order.id)
        if m is None:
            m = MobileOrder(order_id=order.id, store_id=store_id, customer_name="", note="", total_cents=0)
            self.db.add(m)
        if what:
            m.note = what
        if body.customer_name.strip():
            m.customer_name = " ".join(body.customer_name.split())
        row = self.db.get(OrderDelivery, order.id)
        if row is None:
            row = OrderDelivery(order_id=order.id, store_id=store_id, mode="car")
            self.db.add(row)
        row.mode, row.car_plate, row.car_note, row.table_label = "car", plate, note, None
        row.car_color, row.car_model = color, model
        row.updated_at = datetime.now(ZoneInfo("UTC"))
        self.db.commit()
        qr = QRService(self.db).create_or_get(order.id)
        return PlacedOrder(
            token=qr.tracking_url.rstrip("/").split("/")[-1],
            order_number=order.order_number,
            total_cents=m.total_cents,
        )

    def place_order(self, store_id: UUID, body: PlaceOrder) -> PlacedOrder:
        # Imported here: the order and QR modules import this package's neighbours.
        from modules.orders.schemas import OrderCreate
        from modules.orders.services import OrderService
        from modules.qr.services import QRService

        store = self.db.get(Store, store_id)
        if store is None:
            raise HTTPException(status_code=404, detail="Not found")
        public = self.public_menu(store_id)
        if not public.ordering.available or not getattr(public.ordering, body.mode):
            raise HTTPException(status_code=409, detail="The café isn't taking phone orders right now")

        # Price and name come from the menu, never from the phone.
        wanted: dict[UUID, int] = {}
        for line in body.lines:
            wanted[line.item_id] = wanted.get(line.item_id, 0) + line.qty
        items = {
            i.id: i
            for i in self.db.scalars(
                select(MenuItem).where(MenuItem.store_id == store_id, MenuItem.id.in_(list(wanted)))
            )
        }
        total = 0
        for item_id, qty in wanted.items():
            it = items.get(item_id)
            if it is None or not it.available:
                raise HTTPException(status_code=409, detail="An item on your order is no longer available")
            if qty > 20:
                raise HTTPException(status_code=422, detail="Too many of one item")
            total += it.price_cents * qty

        plate, note, label, color, model = self._clean(body)

        order = self._new_phone_order(store)

        self.db.add(
            MobileOrder(
                order_id=order.id, store_id=store_id,
                customer_name=" ".join(body.customer_name.split()),
                note=" ".join(body.note.split()), total_cents=total,
            )
        )
        for item_id, qty in wanted.items():
            it = items[item_id]
            self.db.add(OrderItem(order_id=order.id, name=it.name, qty=qty, unit_cents=it.price_cents))
        self.db.add(
            OrderDelivery(
                order_id=order.id, store_id=store_id, mode=body.mode,
                car_plate=plate, car_note=note, table_label=label,
                car_color=color, car_model=model,
            )
        )
        self.db.commit()
        qr = QRService(self.db).create_or_get(order.id)
        return PlacedOrder(
            token=qr.tracking_url.rstrip("/").split("/")[-1], order_number=order.order_number, total_cents=total
        )
