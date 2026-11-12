"use client";

import { useEffect, useState } from "react";
import { duration } from "@/components/kitchen/KitchenScreen";
import "./analytics.css";

type Data = {
  days: number;
  orders: number;
  collected: number;
  cancelled: number;
  scanned: number;
  customers_coming: number;
  avg_prep_seconds: number | null;
  avg_pickup_seconds: number | null;
  avg_rating: number | null;
  ratings: number;
  per_day: { date: string; orders: number }[];
  per_hour: { weekday: number; hour: number; orders: number }[];
  prep_by_hour: { hour: number; avg_prep_seconds: number | null }[];
};

const RANGES = [
  { days: 7, label: "Son 7 gün · Last 7 days" },
  { days: 30, label: "Son 30 gün · Last 30 days" },
  { days: 90, label: "Son 90 gün · Last 90 days" },
  { days: 365, label: "Son 1 yıl · Last year" },
];

// The backend counts weekdays from Monday = 0.
const WEEKDAYS = ["Pzt · Mon", "Sal · Tue", "Çar · Wed", "Per · Thu", "Cum · Fri", "Cmt · Sat", "Paz · Sun"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** A round number at or above `max`, so the axis reads cleanly. */
function niceMax(max: number) {
  if (max <= 5) return 5;
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / step) * step;
}

function downloadCsv(data: Data) {
  const rows = [["date", "orders"], ...data.per_day.map((d) => [d.date, String(d.orders)])];
  const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `qreader-orders-${data.days}d.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/kitchen/analytics?days=${days}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error ?? "Can't load analytics.");
        setData(body);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message === "Failed to fetch" ? "Can't reach the server." : err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const tiles = data
    ? [
        { label: "Sipariş · Orders", value: String(data.orders) },
        { label: "Ort. hazırlık · Avg. prep time", value: duration(data.avg_prep_seconds) },
        { label: "Hazırdan teslime · Pickup after ready", value: duration(data.avg_pickup_seconds) },
        { label: "QR okutan · Scanned the QR", value: percent(data.scanned, data.orders) },
        { label: "“Geliyorum” · Tapped “I'm coming”", value: String(data.customers_coming) },
        {
          label: `Ort. puan · Avg. rating (${data.ratings})`,
          value: data.avg_rating === null ? "—" : `★ ${data.avg_rating.toFixed(1)}`,
        },
      ]
    : [];

  const dayMax = data ? niceMax(Math.max(...data.per_day.map((d) => d.orders), 0)) : 5;
  const hourCount = new Map(data?.per_hour.map((h) => [`${h.weekday}-${h.hour}`, h.orders]));
  const hourMax = Math.max(...(data?.per_hour.map((h) => h.orders) ?? []), 0);
  const prepMax = Math.max(...(data?.prep_by_hour.map((h) => h.avg_prep_seconds ?? 0) ?? []), 0);

  return (
    <div className="an-page">
      <header className="an-top">
        <div>
          <h1 className="an-title">Analiz</h1>
          <div className="an-sub">Analytics</div>
        </div>
        <div className="an-controls">
          <select
            className="an-select"
            aria-label="Date range"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </select>
          <button className="an-button" disabled={!data} onClick={() => data && downloadCsv(data)}>
            CSV indir · Export CSV
          </button>
        </div>
      </header>

      {error && (
        <div className="an-notice" role="status">
          {error}
        </div>
      )}

      {data && (
        <>
          <dl className="an-tiles">
            {tiles.map((t) => (
              <div key={t.label}>
                <dt>{t.label}</dt>
                <dd>{t.value}</dd>
              </div>
            ))}
          </dl>

          <section className="an-card">
            <div className="an-cardTop">
              <h2>
                Günlük sipariş <span>Orders per day</span>
              </h2>
              <button className="an-link" onClick={() => setTable((v) => !v)} aria-pressed={table}>
                {table ? "Grafik · Chart" : "Tablo · Table"}
              </button>
            </div>
            {table ? (
              <div className="an-tableWrap">
                <table className="an-table">
                  <thead>
                    <tr>
                      <th>Tarih · Date</th>
                      <th>Sipariş · Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.per_day].reverse().map((d) => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td>{d.orders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="an-chart">
                <div className="an-axis" aria-hidden>
                  <span>{dayMax}</span>
                  <span>{dayMax / 2}</span>
                  <span>0</span>
                </div>
                <div className="an-plot">
                  <div className="an-bars" data-dense={data.per_day.length > 60}>
                    {data.per_day.map((d) => (
                      <div
                        key={d.date}
                        className="an-barSlot"
                        tabIndex={0}
                        aria-label={`${d.date}: ${d.orders} orders`}
                      >
                        <div className="an-bar" style={{ height: `${(d.orders / dayMax) * 100}%` }} />
                        <div className="an-tip">
                          <b>{d.orders}</b> sipariş · orders
                          <span>{d.date}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="an-xLabels" aria-hidden>
                    <span>{shortDate(data.per_day[0].date)}</span>
                    <span>{shortDate(data.per_day[data.per_day.length - 1].date)}</span>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="an-card">
            <div className="an-cardTop">
              <h2>
                Yoğun saatler <span>Peak hours</span>
              </h2>
              <div className="an-scale" aria-hidden>
                0
                <i data-level="1" />
                <i data-level="2" />
                <i data-level="3" />
                <i data-level="4" />
                {hourMax}
              </div>
            </div>
            <div className="an-heatWrap">
              <div className="an-heat" role="table" aria-label="Orders by weekday and hour">
                <div className="an-heatRow" role="row" aria-hidden>
                  <span />
                  {HOURS.map((h) => (
                    <span key={h} className="an-heatHour">
                      {h % 3 === 0 ? h : ""}
                    </span>
                  ))}
                </div>
                {WEEKDAYS.map((name, w) => (
                  <div key={name} className="an-heatRow" role="row">
                    <span className="an-heatDay" role="rowheader">
                      {name}
                    </span>
                    {HOURS.map((h) => {
                      const n = hourCount.get(`${w}-${h}`) ?? 0;
                      const level = n === 0 ? 0 : Math.max(1, Math.ceil((n / hourMax) * 4));
                      return (
                        <span
                          key={h}
                          className="an-cell"
                          role="cell"
                          tabIndex={n ? 0 : undefined}
                          data-level={level}
                          aria-label={`${name}, ${hourLabel(h)}: ${n} orders`}
                        >
                          {n > 0 && (
                            <span className="an-tip">
                              <b>{n}</b> sipariş · orders
                              <span>
                                {name}, {hourLabel(h)}
                              </span>
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="an-card">
            <div className="an-cardTop">
              <h2>
                Saate göre hazırlık süresi <span>Prep time by hour</span>
              </h2>
            </div>
            {prepMax === 0 ? (
              <p className="an-empty">Henüz hazırlanan sipariş yok · No orders have been made ready yet.</p>
            ) : (
              <div className="an-chart">
                <div className="an-axis" aria-hidden>
                  <span>{duration(prepMax)}</span>
                  <span>{duration(prepMax / 2)}</span>
                  <span>0</span>
                </div>
                <div className="an-plot">
                  <div className="an-bars">
                    {data.prep_by_hour.map((h) => (
                      <div
                        key={h.hour}
                        className="an-barSlot"
                        tabIndex={h.avg_prep_seconds ? 0 : undefined}
                        aria-label={`${hourLabel(h.hour)}: ${duration(h.avg_prep_seconds)}`}
                      >
                        <div
                          className="an-bar"
                          style={{ height: `${((h.avg_prep_seconds ?? 0) / prepMax) * 100}%` }}
                        />
                        {h.avg_prep_seconds !== null && (
                          <div className="an-tip">
                            <b>{duration(h.avg_prep_seconds)}</b>
                            <span>{hourLabel(h.hour)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="an-xLabels" aria-hidden>
                    <span>00:00</span>
                    <span>12:00</span>
                    <span>23:00</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
