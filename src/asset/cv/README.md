Put UTF-8 `.txt` CV files in this directory. Each filename becomes an icon in
the desktop Trashcan, and its text opens in the Windows 98 Notepad editor.
Files are discovered automatically; no manifest or code changes are needed.
Notepad sizes itself to the text and available screen space, with scrolling for
long CVs. It adjusts when you edit the text, change word wrap, or resize the browser.

Replace or delete the included templates. Vite picks up added and changed files
during development; rebuild the site to publish updated CVs. These files are
public website content. Editing in Notepad changes the current browser session;
**File → Save as…** downloads a copy without changing these source files.
