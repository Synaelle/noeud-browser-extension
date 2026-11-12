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

# Building

With Node 24 and pnpm:

```sh
pnpm install
pnpm build
```

This gives `dist/chromium` and `dist/firefox`. Load the first from the extensions page with developer mode on, and the second from `about:debugging`.
