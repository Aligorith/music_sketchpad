// CHUNK 1 =================================================
"use strict";

const VF = Vex.Flow;
const $ = id => document.getElementById(id);

// --------------------------------------------------
// APPLICATION STATE
// --------------------------------------------------

let parts = [
  {
    name:"Piano",
    instrument:"acoustic_grand_piano",
    volume:.85,
    notation:"c'4 d'4 e'4 g'4 a'2 g'2"
  },
  {
    name:"Flute",
    instrument:"flute",
    volume:.8,
    notation:"g'2 a'4 b'4 c''2 d''2"
  },
  {
    name:"Oboe",
    instrument:"oboe",
    volume:.8,
    notation:"c'4 e'4 g'2 e'4 c'4"
  }
];

let selectedPart = 0;
let audioContext = null;
let players = new Map();

let playing = false;
let playbackStart = 0;
let playbackLength = 0;
let animationFrame = null;
let stopRequested = false;

// Selected note within the currently selected part.
// This is the token index in the LilyPond notation.
let selectedNoteIndex = null;

let currentDuration = {
  beats:1,
  dotted:false
};

// Explicit accidental overrides, separate from LilyPond.
// Key format: letter:octave
let accidentalOverrides = {};

const durationNames = [
  {beats:.125,code:"32",name:"demisemiquaver"},
  {beats:.25,code:"16",name:"semiquaver"},
  {beats:.5,code:"8",name:"quaver"},
  {beats:1,code:"4",name:"crotchet"},
  {beats:2,code:"2",name:"minim"},
  {beats:4,code:"1",name:"semibreve"}
];

// --------------------------------------------------
// DURATION MANAGEMENT
// --------------------------------------------------

function durationCode(d) {
  return durationNames.find(x =>
    Math.abs(x.beats-d.beats)<.001
  )?.code || "4";
}

function durationText(d) {
  return durationCode(d)+(d.dotted?".":"");
}

function updateDurationDisplay() {
  const d=currentDuration;

  const name=durationNames.find(x =>
    Math.abs(x.beats-d.beats)<.001
  )?.name || "custom";

  $("durationDisplay").textContent =
    "Current duration: "+name+
    (d.dotted?" (dotted)":"")+
    " ("+durationText(d)+")";
}

function durationBeats(token) {
  let beats =
    token.duration==="1" ? 4 :
    token.duration==="2" ? 2 :
    token.duration==="4" ? 1 :
    token.duration==="8" ? .5 :
    token.duration==="16" ? .25 :
    token.duration==="32" ? .125 : 1;

  return beats*(token.dotted?1.5:1);
}

// CHUNK 2 =================================================

// --------------------------------------------------
// LILYPOND NOTATION PARSING
// --------------------------------------------------

function tokenize(source) {
  return source.trim().split(/\s+/).filter(Boolean);
}

function parseToken(token) {

  if(token==="|") {
    return {bar:true};
  }

  const rest=token.match(/^r(\d+)?(\.*)$/);

  if(rest) {
    return {
      rest:true,
      duration:rest[1]||"4",
      dotted:rest[2].length>0
    };
  }

  const match=token.match(
    /^([a-g])(is|es)?([',]*)(\d+)?(\.*)$/
  );

  if(!match) {
    throw new Error("Invalid LilyPond token: "+token);
  }

  return {
    letter:match[1],
    accidental:match[2]||"",
    octaveMarks:match[3]||"",
    natural:(match[2]===""),
    duration:match[4]||"4",
    dotted:match[5].length>0
  };
}

// --------------------------------------------------
// PITCH AND ACCIDENTAL MANAGEMENT
// --------------------------------------------------

function pitchInfo(token,state) {

  if(token.rest) return null;

  let octave=3;

  for(const c of token.octaveMarks) {
    octave += c==="'" ? 1 : -1;
  }

  const key=token.letter;

  let accidental=token.accidental;

  if(token.natural) {
    accidental="";
    state[key]="";
  }
  else if(accidental) {
    state[key]=accidental;
  }
  else {
    accidental=state[key]||"";
  }

  const semitones={
    c:0,
    d:2,
    e:4,
    f:5,
    g:7,
    a:9,
    b:11
  };

  return {
    letter:token.letter,
    octave,
    accidental,

    pitch:
      12*(octave+1)+
      semitones[token.letter]+
      (accidental==="is"?1:
       accidental==="es"?-1:0),

    key
  };
}

function parsePart(part) {

  const events=[];
  let beat=0;

  const accidentalState={};

  const sourceTokens=tokenize(part.notation);

  for(let tokenIndex=0;tokenIndex<sourceTokens.length;tokenIndex++) {

    const raw=sourceTokens[tokenIndex];

    const token=parseToken(raw);

    if(token.bar) {

      events.push({
        bar:true,
        beat,
        tokenIndex
      });

      Object.keys(accidentalState).forEach(
        k=>delete accidentalState[k]
      );

      continue;
    }

    const info=pitchInfo(token,accidentalState);

    events.push({
      ...token,
      ...info,
      raw,
      beat,
      beats:durationBeats(token),
      tokenIndex
    });

    beat+=durationBeats(token);
  }

  return events;
}

function totalBeats() {

  return Math.max(
    0,
    ...parts.map(p =>
      parsePart(p).reduce(
        (sum,e)=>sum+(e.bar?0:e.beats),
        0
      )
    )
  );
}


// CHUNK 3 =====================================================

// --------------------------------------------------
// PART MANAGEMENT
// --------------------------------------------------

function renderTabs() {

  const container=$("parts");
  container.innerHTML="";

  parts.forEach((part,index)=> {

    const button=document.createElement("button");

    button.className=
      "part-tab"+
      (index===selectedPart?" active":"");

    button.textContent=part.name;

    button.onclick=()=> {

      saveEditor();

      selectedNoteIndex=null;
      selectedPart=index;

      renderTabs();
      loadEditor();
    };

    container.append(button);
  });
}

function loadEditor() {

  const p=parts[selectedPart];

  if(!p) return;

  $("partName").value=p.name;
  $("instrument").value=p.instrument;
  $("volume").value=p.volume;
  $("notation").value=p.notation;
}

function saveEditor() {

  const p=parts[selectedPart];

  if(!p) return;

  p.name=$("partName").value;
  p.instrument=$("instrument").value;
  p.volume=Number($("volume").value);
  p.notation=$("notation").value;
}

function refresh() {

  saveEditor();

  renderTabs();
  renderScore();
}

function addPart() {

  saveEditor();

  parts.push({
    name:"Part "+(parts.length+1),
    instrument:"acoustic_grand_piano",
    volume:.8,
    notation:"c'4 d'4 e'4 g'4"
  });

  selectedPart=parts.length-1;

  renderTabs();
  loadEditor();
  renderScore();
}

// --------------------------------------------------
// LILYPOND PITCH CONVERSION
// --------------------------------------------------

function midiToLily(midi) {

  const names = [
    "c","cis","d","ees",
    "e","f","fis","g",
    "gis","a","bes","b"
  ];

  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const relative = octave - 3;

  const marks = relative > 0
    ? "'".repeat(relative)
    : ",".repeat(-relative);

  return {
    name: names[pc],
    octave,
    marks,
    letter: names[pc][0],
    accidental:
      names[pc].endsWith("is") ? "is" :
      names[pc].endsWith("es") ? "es" : "",
    natural: !names[pc].endsWith("is") &&
             !names[pc].endsWith("es")
  };
}

// --------------------------------------------------
// SCORE RENDERING
// --------------------------------------------------

function renderScore() {

  try {

    const output=$("score");
    output.innerHTML="";

    const width=Math.max(
      500,
      $("scoreScroll").clientWidth-16
    );
    const height=Math.max(
      140,
      parts.length*150+20
    );

    const renderer=new VF.Renderer(
      output,
      VF.Renderer.Backends.SVG
    );

    renderer.resize(width,height);

    const context=renderer.getContext();

    parts.forEach((part,index)=> {

      const y=25+index*150;

      const stave=new VF.Stave(
        15,
        y,
        width-55
      );

      stave.addClef("treble");

      stave.setBegBarType(VF.Barline.type.NONE);
      stave.setEndBarType(VF.Barline.type.NONE);

      stave.setContext(context).draw();

      const events=parsePart(part);
      const tickables=[];

      events.forEach(event=> {

        if(event.bar) {

          tickables.push(
            new VF.BarNote(VF.Barline.type.SINGLE)
          );

          return;
        }

        if(event.rest) {
          let note = new VF.StaveNote({
              keys:["b/4"],
              duration:
                durationCode(event)+
                (event.dotted?"d":"")+"r",
              clef:"treble"
            });
          note._tokenIndex=event.tokenIndex;
          tickables.push(note);

          return;
        }

        let note=new VF.StaveNote({

          keys:[
            event.letter+"/"+event.octave
          ],

          duration:
            durationCode(event)+
            (event.dotted?"d":""),

          clef:"treble"
        });
        note._tokenIndex=event.tokenIndex;

        if(event.accidental) {

          note.addModifier(
            new VF.Accidental(
              event.accidental==="is" ? "#" :
              event.accidental==="es" ? "b" : "n"
            ),
            0
          );
        }

        tickables.push(note);
      });

      if(tickables.length) {

        const beats=events.reduce(
          (sum,e)=>sum+(e.bar?0:e.beats),
          0
        );

        const voice=new VF.Voice({
          num_beats:Math.max(1,Math.ceil(beats)),
          beat_value:4
        });

        voice.setStrict(false);
        voice.addTickables(tickables);

        new VF.Formatter()
          .joinVoices([voice])
          .format([voice],width-170);

        voice.draw(context,stave);
        
        // Attach click handlers to individual score notes.
        tickables.forEach(note => {

          if(note instanceof VF.BarNote) return;

          const element=note.getSVGElement?.();

          if(!element) return;

          // Highlight selected note.
          if(note._tokenIndex===selectedNoteIndex) {
            element.classList.add("score-note-selected");
          }

          element.style.cursor="pointer";

          element.addEventListener("click",event => {
            event.stopPropagation();
            selectNote(note._tokenIndex);
          });

        });
      }
      
      // Draw insertion cursor at the end of the part.
      const svg=output.querySelector("svg");

      if(svg && tickables.length) {

        const last=tickables[tickables.length-1];

        if(!(last instanceof VF.BarNote)) {

          const x=last.getAbsoluteX()+last.getWidth()+5;

          const ns="http://www.w3.org/2000/svg";

          const line=document.createElementNS(ns,"line");

          line.setAttribute("x1",x);
          line.setAttribute("x2",x);
          line.setAttribute("y1",y);
          line.setAttribute("y2",y+100);

          line.setAttribute("stroke","#2563eb");
          line.setAttribute("stroke-width","2");
          line.setAttribute("stroke-dasharray","4 3");

          svg.appendChild(line);
        }
      }

      context.save();
      context.setFont("Arial",12,"normal");
      context.fillText(part.name,20,y-5);
      context.restore();

    });

    $("status").textContent="Score updated.";

  } catch(error) {

    $("status").textContent=
      "Notation error: "+error.message;

    console.error(error);
  }
}

// CHUNK 4 =============================================================

// --------------------------------------------------
// LAST NOTE MODIFICATION
// --------------------------------------------------

function lastNoteIndex() {

  const tokens=tokenize(
    parts[selectedPart].notation
  );

  for(let i=tokens.length-1;i>=0;i--) {

    if(tokens[i]!=="|" && !/^r/.test(tokens[i])) {
      return i;
    }
  }

  return -1;
}

function getAccidentalState() {

  const state = {};

  const tokens = tokenize(
    parts[selectedPart].notation
  );

  for(const raw of tokens) {

    const token = parseToken(raw);

    if(token.bar) {
      Object.keys(state).forEach(
        key => delete state[key]
      );
      continue;
    }

    if(token.rest) continue;

    pitchInfo(token,state);
  }

  // Apply explicit naturalisations and other overrides.
  Object.entries(accidentalOverrides).forEach(
    ([key,value]) => {
      state[key] = value;
    }
  );

  return state;
}

function updateLastNote(transform) {

  const p=parts[selectedPart];
  const tokens=tokenize(p.notation);

  const index=getEditingIndex();

  if(index<0) return;

  const token=parseToken(tokens[index]);

  const state=getAccidentalState();
  const info=pitchInfo(token,state);

  if(!info) return;

  const newMidi=transform(info.pitch);

  const converted=midiToLily(newMidi);

  const newPitch=
    converted.name+
    converted.marks;

  // Remember the accidental independently of LilyPond.
  const key=converted.letter+":"+converted.octave;

  const standardAccidental=converted.accidental;

  accidentalOverrides[key]=standardAccidental;

  // Update notation without adding natural markers.
  tokens[index]=
    newPitch+
    token.duration+
    (token.dotted?".":"");

  p.notation=tokens.join(" ");

  $("notation").value=p.notation;

  renderScore();

  previewPitch(newPitch);
}

// --------------------------------------------------
// NOTE ENTRY
// --------------------------------------------------

function appendToken(token) {

  saveEditor();

  const p=parts[selectedPart];

  if(selectedNoteIndex!==null) {

    const tokens=tokenize(p.notation);

    tokens[selectedNoteIndex]=token;

    p.notation=tokens.join(" ");

    $("notation").value=p.notation;

    renderScore();

    return;
  }

  p.notation=(
    p.notation.trim()+" "+token
  ).trim();

  $("notation").value=p.notation;

  renderScore();
}

function appendPitch(letter) {

  const tokens = tokenize(
    parts[selectedPart].notation
  );

  let lastPitch = null;

  const searchStart=selectedNoteIndex!==null
    ? selectedNoteIndex
    : tokens.length-1;

  for(let i=searchStart;i>=0;i--) {

    if(tokens[i] === "|" || /^r/.test(tokens[i])) {
      continue;
    }

    try {
      const token = parseToken(tokens[i]);
      lastPitch = pitchInfo(token,{});
      if(lastPitch) break;
    } catch(e) {}
  }

  const semitones = {
    c:0,d:2,e:4,f:5,g:7,a:9,b:11
  };

  let octave = 3;

  if(lastPitch) {

    const candidates = [];

    for(let o=lastPitch.octave-1;
        o<=lastPitch.octave+1;o++) {

      candidates.push({
        octave:o,
        pitch:12*(o+1)+semitones[letter]
      });
    }

    candidates.sort((a,b)=>
      Math.abs(a.pitch-lastPitch.pitch)-
      Math.abs(b.pitch-lastPitch.pitch)
    );

    octave=candidates[0].octave;
  }

  const key=letter;

  const state=getAccidentalState();

  const accidental=state[key]||"";

  const marks=octave>3
    ? "'".repeat(octave-3)
    : ",".repeat(3-octave);

  const pitch=letter+accidental+marks;

  previewPitch(pitch);

  appendToken(
    pitch+durationText(currentDuration)
  );
}

function appendRest() {

  appendToken(
    "r"+durationText(currentDuration)
  );
}

function appendBar() {

  appendToken("|");
  accidentalOverrides={};
}

// --------------------------------------------------
// DURATION CHANGES
// --------------------------------------------------

function replaceLastDuration(d) {

  const p=parts[selectedPart];
  const tokens=tokenize(p.notation);

  const index=getEditingIndex();

  if(index<0 || !tokens[index]) return;

  const token=parseToken(tokens[index]);

  if(token.bar) return;

  const name=token.rest
    ? "r"
    : token.letter+
      token.accidental+
      token.octaveMarks+
      (token.natural?"!":"");

  tokens[index]=name+durationText(d);

  p.notation=tokens.join(" ");

  $("notation").value=p.notation;

  renderScore();
}

function adjustDuration(factor) {

  const actual=
    currentDuration.beats*
    (currentDuration.dotted?1.5:1)*
    factor;

  let found=null;

  for(const item of durationNames) {

    if(Math.abs(item.beats-actual)<.001) {

      found={
        beats:item.beats,
        dotted:false
      };

      break;
    }

    if(Math.abs(item.beats*1.5-actual)<.001) {

      found={
        beats:item.beats,
        dotted:true
      };
    }
  }

  if(found) currentDuration=found;

  replaceLastDuration(currentDuration);
  updateDurationDisplay();
}

function dottedAdjust(factor) {

  adjustDuration(factor);
}

// CHUNK 5 ===================================================

// --------------------------------------------------
// SOUND FONT AND AUDIO
// --------------------------------------------------

async function getPlayer(instrument) {

  if(!audioContext) {

    audioContext=new(
      window.AudioContext ||
      window.webkitAudioContext
    )();
  }

  if(audioContext.state==="suspended") {
    await audioContext.resume();
  }

  if(!players.has(instrument)) {

    players.set(
      instrument,

      Soundfont.instrument(
        audioContext,
        instrument,
        {
          soundfont:"FluidR3_GM",
          format:"mp3",
          gain:1
        }
      )
    );
  }

  return await players.get(instrument);
}

async function previewPitch(lily) {

  try {

    const event=parseToken(lily+"4");
    const info=pitchInfo(event,{});

    const player=await getPlayer(
      parts[selectedPart].instrument
    );

    player.play(
      info.pitch,
      audioContext.currentTime,
      {
        duration:60/Number($("tempo").value),
        gain:parts[selectedPart].volume
      }
    );

  } catch(error) {

    $("status").textContent=
      "Preview error: "+error.message;
  }
}

// --------------------------------------------------
// PLAYBACK
// --------------------------------------------------

async function play() {

  if(playing) return;

  stopRequested=false;

  try {

    saveEditor();

    const bpm=Number($("tempo").value);

    const marker=Math.max(
      0,
      Number($("marker").value)||0
    );

    if(!Number.isFinite(bpm)||bpm<20||bpm>300) {
      throw new Error("Tempo must be between 20 and 300.");
    }

    if(marker>=totalBeats()) {
      throw new Error("Marker is beyond the end of the score.");
    }

    $("status").textContent="Loading instruments...";

    const loaded=await Promise.all(
      parts.map(async part=>({

        part,

        player:await getPlayer(part.instrument)

      }))
    );

    if(stopRequested) return;

    const start=audioContext.currentTime+.15;
    const seconds=60/bpm;

    playbackStart=start;

    playbackLength=
      (totalBeats()-marker)*seconds;

    playing=true;

    $("play").disabled=true;
    $("stop").disabled=false;

    loaded.forEach(({part,player})=> {

      parsePart(part).forEach(event=> {

        if(event.bar||event.rest) return;

        const end=event.beat+event.beats;

        if(end<=marker) return;

        const actualStart=Math.max(
          marker,
          event.beat
        );

        player.play(
          event.pitch,

          start+(actualStart-marker)*seconds,

          {
            duration:
              (end-actualStart)*seconds,

            gain:part.volume
          }
        );

      });

    });

    $("status").textContent="Playing.";

    updateProgress();

  } catch(error) {

    stop();

    $("status").textContent=
      "Playback error: "+error.message;

    console.error(error);
  }
}

// CHUNK 6 ================================================================

// --------------------------------------------------
// PLAYBACK PROGRESS AND STOP
// --------------------------------------------------

function updateProgress() {

  if(!playing) return;

  const elapsed=
    audioContext.currentTime-playbackStart;

  const fraction=Math.min(
    1,
    Math.max(0,elapsed/playbackLength)
  );

  $("progressBar").style.width=
    (fraction*100)+"%";

  if(fraction>=1) {

    stop();

    $("status").textContent=
      "Playback finished.";

    return;
  }

  animationFrame=
    requestAnimationFrame(updateProgress);
}

function stop() {

  stopRequested=true;

  if(animationFrame) {
    cancelAnimationFrame(animationFrame);
  }

  players.forEach(p=>
    p.then(player=>player.stop()).catch(()=>{})
  );

  playing=false;

  $("play").disabled=false;
  $("stop").disabled=true;

  $("progressBar").style.width="0%";
}

// --------------------------------------------------
// SELECTION
// --------------------------------------------------

function clearNoteSelection() {
  selectedNoteIndex=null;
  renderScore();
}

function selectNote(index) {
  selectedNoteIndex=index;
  renderScore();

  const token=parseToken(
    tokenize(parts[selectedPart].notation)[index]
  );

  if(!token.rest) {
    const state=getAccidentalState();
    const info=pitchInfo(token,state);

    if(info) {
      previewPitch(
        midiToLilyWithAccidental(info.pitch).name +
        midiToLilyWithAccidental(info.pitch).marks
      );
    }
  }
}

function getEditingIndex() {
  return selectedNoteIndex !== null
    ? selectedNoteIndex
    : lastNoteIndex();
}


// --------------------------------------------------
// EVENT HANDLERS
// --------------------------------------------------

// Note buttons

document.querySelectorAll("[data-note]").forEach(button=> {

  button.onclick=()=>
    appendPitch(button.dataset.note);

});

// Rests and barlines

$("restButton").onclick=appendRest;
$("barButton").onclick=appendBar;

// Duration controls

$("halfDuration").onclick=()=>adjustDuration(.5);
$("doubleDuration").onclick=()=>adjustDuration(2);

$("dotDown").onclick=()=>dottedAdjust(1/1.5);
$("dotUp").onclick=()=>dottedAdjust(1.5);

// Pitch controls

$("octaveUp").onclick=
  ()=>updateLastNote(n=>n+12);

$("octaveDown").onclick=
  ()=>updateLastNote(n=>n-12);

$("semitoneUp").onclick=
  ()=>updateLastNote(n=>n+1);

$("semitoneDown").onclick=
  ()=>updateLastNote(n=>n-1);

// Part settings

$("partName").onchange=refresh;
$("instrument").onchange=saveEditor;
$("volume").oninput=saveEditor;

// Direct notation editing

$("notation").oninput=()=> {

  parts[selectedPart].notation=
    $("notation").value;

  renderScore();

};

// Editing actions

$("refresh").onclick=refresh;

$("addPart").onclick=addPart;

$("clear").onclick=()=> {

  parts[selectedPart].notation="";

$("notation").value="";

  renderScore();
};

$("score").addEventListener("click",event => {

  if(
    event.target.closest("svg") &&
    !event.target.closest(".vf-stavenote")
  ) {
    clearNoteSelection();
  }

});

// Playback

$("play").onclick=play;
$("stop").onclick=stop;

// Resize

window.addEventListener(
  "resize",
  renderScore
);

// --------------------------------------------------
// KEYBOARD SHORTCUTS
// --------------------------------------------------

document.addEventListener("keydown", function(event) {

  // Ignore shortcuts when typing in text fields.
  const target = event.target;

  if (
    target.tagName === "TEXTAREA" ||
    target.tagName === "INPUT" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  ) {
    return;
  }

  // Avoid browser defaults for handled shortcuts.
  const key = event.key.toLowerCase();

  // Note names: A-G
  if (!event.ctrlKey && !event.altKey && !event.metaKey) {

    if ("abcdefg".includes(key) && key.length === 1) {
      event.preventDefault();

      const button = document.querySelector(
        `[data-note="${key}"]`
      );

      if(button) button.click();
      return;
    }

    // Rest
    if(key === "r") {
      event.preventDefault();
      $("restButton").click();
      return;
    }

    // Duration changes
    if(key === "w") {
      event.preventDefault();

      if(event.shiftKey) {
        $("dotUp").click();
      } else {
        $("doubleDuration").click();
      }

      return;
    }

    if(key === "q") {
      event.preventDefault();

      if(event.shiftKey) {
        $("dotDown").click();
      } else {
        $("halfDuration").click();
      }

      return;
    }

    // Semitone changes
    if(key === "arrowup") {
      event.preventDefault();
      $("semitoneUp").click();
      return;
    }

    if(key === "arrowdown") {
      event.preventDefault();
      $("semitoneDown").click();
      return;
    }

    // Playback toggle
    if(key === " ") {
      event.preventDefault();

      if(playing) {
        $("stop").click();
      } else {
        $("play").click();
      }

      return;
    }
  }

  // Octave changes: Ctrl + Up/Down
  if(event.ctrlKey && !event.altKey && !event.metaKey) {

    if(key === "arrowup") {
      event.preventDefault();
      $("octaveUp").click();
      return;
    }

    if(key === "arrowdown") {
      event.preventDefault();
      $("octaveDown").click();
      return;
    }
  }

});

// --------------------------------------------------
// INITIALISE
// --------------------------------------------------

renderTabs();
loadEditor();
updateDurationDisplay();
renderScore();
