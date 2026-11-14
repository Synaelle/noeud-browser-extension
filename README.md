<p align="center">
  <img src="public/icons/icon-128.png" alt="" width="120">
</p>

<h1 align="center">Noeud for browsers</h1>

<p align="center">Simple reminders that notify you in Chromium browsers and Firefox.</p>

# Features

- Works on its own, with no account and no server.
- Type when as a duration like `8h52` or `7w1h3s`, a time like `18:00` or a day like `tomorrow 9:00`, and see exactly when it will notify you before adding it.
- A reminder that came due while the browser was closed notifies you as soon as the browser starts again.
- The times you use most come first, for new reminders and for snoozing.
- Syncs with your own [Noeud](https://github.com/Synaelle/noeud) server once you add it.

# Installing

Download the newest version from [Releases](https://github.com/Synaelle/noeud-browser-extension/releases/latest).

## Chrome, Brave, Edge, Vivaldi and other Chromium browsers

1. Download `noeud-chromium-<version>.zip` and unzip it into a folder you keep, such as `Documents/Noeud`. The browser loads Noeud from this folder each time it starts, so leave it in place.
2. Open the extensions page: `chrome://extensions`, `brave://extensions`, `edge://extensions` or `vivaldi://extensions`.
3. Turn on Developer mode at the top right.
4. Click Load unpacked and pick the folder.
5. Click the puzzle piece in the toolbar, then the pin next to Noeud. <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> opens it too.

To update, empty the folder, unzip the new version into it, then click the round arrow on Noeud's card in the extensions page. Your reminders stay.

## Firefox

1. Download `noeud-firefox-<version>.zip`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click Load Temporary Add-on and pick the zip.

Firefox removes an extension loaded this way each time it closes. A signed Firefox version that stays installed will come later.

## Syncing with your server

Click the gear in Noeud, enter your [Noeud server](https://github.com/Synaelle/noeud)'s address and a token made for the extension, then click Connect and allow access to that address.

# Building

With Node 24 and pnpm:

```sh
pnpm install
pnpm build
```

This gives `dist/chromium` and `dist/firefox`, loaded the same way as the unzipped releases above.
