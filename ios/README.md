# QReader iOS (App Clip)

`QReader` is a tiny parent app (an App Clip must ship inside one). `QReaderClip` is the product:
scanning the order QR opens it, it shows the order, polls every 3 s, and registers for APNs.

Regenerate the Xcode project after editing `project.yml`: `brew install xcodegen && xcodegen generate`.

## Test in the simulator (no Apple account)
    xcodebuild -project QReader.xcodeproj -scheme QReader -sdk iphonesimulator \
      -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
    xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/QReaderClip.app
    SIMCTL_CHILD__XCAppClipURL="http://localhost:3000/track/<token>" xcrun simctl launch booted com.example.qreader.Clip

## Before it works on a real iPhone (needs a paid Apple Developer account)
1. Replace `com.example.qreader` (project.yml, both targets + entitlements) with your bundle ID,
   set `DEVELOPMENT_TEAM`, and replace `qreader.example.com` with your HTTPS domain.
2. Replace `TEAMID.com.example.qreader.Clip` in `web/public/.well-known/apple-app-site-association`.
3. Deploy the site over HTTPS; the AASA file must be reachable at `/.well-known/apple-app-site-association`.
4. In App Store Connect create an App Clip Experience whose URL prefix is `https://<domain>/track`.
5. Create an APNs key; fill `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` (= the *clip* bundle ID), `APNS_PRIVATE_KEY` in the backend `.env`.
6. Debug builds register as `sandbox`, Release/TestFlight as `production`.
