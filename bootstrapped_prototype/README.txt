# Overview

This folder contains the series of vibe-coded HTML5 progression files + prompt / response notes
used for bootstrapping up a prototype to check if the planned design was going to work as I had
expected, and for putting together an example of how Vexflow + Soundfont music playback could be
coupled together to create something like this.

This was originally built over the 2026 Canterbury Anniversary Weekend.


# Status

**Latest Version:**  "m13" 

NOTE: The tweaks from the .md are not fully applied. In fact, many of the suggestions from the "pending"
ones (i.e. m15 - m18) probably can't be directly applied, as the codebase as is actually becoming quite
a mess that is in need of a serious refactor.

Major todo's:
* Addressing the note entry bug (and/or any other things noted in "bugs.txt")

* All the staves are currently built in an out-of-sync way. So, they all really need to be moved within
  a proper VexFlow multi-part setup. Which in turn requires going back to first principles

* Also, a lot of the state is currently stored in variables, which makes it very difficult to split all
  that out into easy JSON-based project load/save.  Also, perhaps the JS code should be split into separate
  files for each of the separate sections.

* The parts should be empty initially (and only a single part enabled), when we have verified that the multi-part
  stuff is working correctly

* The whole insert time / cursor / insert-vs-overwrite mode stuff needs a serious reworking

* "Backspace" button to undo the last note added

* Need to stop re-rendering the whole score on each update, causing the scroll to get reset. (This is particularly bad on mobile, where you lose what you were looking at).

* Need to fix the ui buttons more
** button grouping
** show current accidental mode on the row
** show the time buttons around the current duration display instead?
