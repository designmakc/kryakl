## What's new in 0.16.0

**A window by task.** The sidebar is now eleven places: Translate, English, Voice typing, Recordings and meetings, Keyboard layout and a few more. Every line says what it does: Listen is now called Translate and read aloud. Listen and Screen live in Translate, Talk and Check in English. Home sums up Kryakl's state, your downloads and your keys.

**All actions on one key (new).** Set one key, and Kryakl's menu opens by the text cursor. Press a letter to pick an action, in any layout. Each action keeps its own key too.

**Ctrl+C twice is a key like any other.** Put it on any action that works on a selection. A new install has no key on it. If you used it to listen, it moves to Translate and read aloud by itself, unless that action already had a key of its own: then set it again.

**Any key can be recorded.** Key fields now read the keyboard itself, so Ctrl+Esc, Shift+Caps Lock and Alt work.

**Text editing for voice typing (new, off by default).** Your local model puts a dictated phrase right before it is typed: Clean up, Business tone, Task for an AI, List, or My own instruction. Turn it on in Voice typing › Text editing. It uses the same model as Check my English. With no model, a busy graphics card, a slow answer or an answer that looks wrong, the phrase is typed as you said it, and the panel says why.

**The dictation panel.** Drag it by any part. The chevron folds it into the tray for this phrase, and the recording goes on. A setting in Voice typing turns the panel off; errors still show.

**The right language.** A phrase in your own language could come out in English when it started with a breath or a short word. Kryakl now decides from a whole piece of speech, and a close call goes to your own language. So a short English phrase with a strong accent may come out in your language.

**Smaller things.** Kryakl's own lists replace Windows' dropdowns. Lists are more compact. The Chrome extension's steps now include the microphone. Talks from Krya that stayed in the old folder move over at the first start.

## Install and update

**Install:** download `Kryakl-Setup-<version>.exe` and run it. The installer is not signed, so Windows warns: **More info → Run anyway**. Kryakl starts with Windows and lives in the tray.

**Update:** Kryakl does not update itself. Download the new installer from here and run it: it installs over the old version, and your settings, words and downloads stay.

**Krya is now Kryakl (0.15):** install over Krya as usual. At its first start Kryakl moves Krya's settings, words, models and transcripts into its own folders; nothing downloads again. Quit Krya first if it still runs. 0.15.1 fixes 0.15.0, whose speech engine did not start after the move (dictation said "The speech engine is starting" at every press): it sets itself right at the first start, and nothing downloads again.

**Updating from 0.11.0 or earlier, with Chrome's meeting recorder:** the extension now has a fixed id, and Kryakl takes recordings only from it. Once: on `chrome://extensions` press **Remove** on the meeting recorder, then **Load unpacked** from Kryakl's folder again (the Google Meet page in Kryakl shows the steps).
