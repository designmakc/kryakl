// Kryakl's clipboard watcher on a Mac, for Ctrl+C twice (there ⌘C twice): a Mac
// tells nobody when the pasteboard changes, so its change count is looked at every
// 20 ms, and each change is one line on stdout, 1 when Command is held at that
// moment, else 0 (src/winclip.ts watchClipboardMac). It ends when stdin closes:
// Kryakl is gone. npm run dist:mac builds it into vendor/clip-mac.

import AppKit
setvbuf(stdout, nil, _IOLBF, 0)
var last = NSPasteboard.general.changeCount
Timer.scheduledTimer(withTimeInterval: 0.02, repeats: true) { _ in
  let now = NSPasteboard.general.changeCount
  if now == last { return }
  last = now
  print(CGEventSource.flagsState(.combinedSessionState).contains(.maskCommand) ? "1" : "0")
  fflush(stdout)
}
FileHandle.standardInput.readabilityHandler = { h in if h.availableData.isEmpty { exit(0) } }
RunLoop.main.run()
