//~ xmlplay_emb, Revision: 188, Copyright (C) 2016-2025: Willem Vree, contributions Stéphane David.
//~ This program is free software; you can redistribute it and/or modify it under the terms of the
//~ GNU General Public License as published by the Free Software Foundation; either version 2 of
//~ the License, or (at your option) any later version.
//~ This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
//~ without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
//~ See the GNU General Public License for more details. <http://www.gnu.org/licenses/gpl.html>.

'use strict'
var xmlplay_VERSION = 188;
import * as mLib from './xmlplay_lib.js';
import * as sLib from './xmlplay_syn.js';

(function () {
    var opt = {
        speed: 1.0,     // initial value of the menu item: speed
        withRT: 1,      // enable real time synthesis, otherwise pre-rendered waves (MIDIjs)
        curmsk: 0,      // cursor mask
        sf2url1: './',  // path to directory containing sound SF2 fonts
        sf2url2: '',    // fall back path
        instTab: {},    // { instrument number -> instrument name } for non standard instrument names
        midijsUrl1: './',       // path to directory containing sound MIDI-js fonts
        midijsUrl2: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/',
        instList: {},   // {voice number: instrument number} (override %%MIDI)
        transMap: {},   // stem nummer -> transpositie
        burak: 0,       // fast playback of appogiatura and tremolo
        nosm: 0,        // no smooth scrolling
        noDash: 0,      // hide dotted line
        arpmaxdur: 36,  // max duration of arpeggio in ABC ticks (36 == 75 msec bij tempo 75)
        dynvce: 0       // dynamics only affect the voice where they occur (else all voices of the staff)
    }
    var gAbcSave, gAbcTxt, scoreFnm;
    var isPlaying = 0;
    var audioCtx = null;
    var midiUsedArr = [];   // midi nums in score
    var notationHeight = 100;
    var fileURL = '';
    var drop_files = null;
    var mapTab = {};    // { map_name + ABC_note -> midi_number }
    var midiVol = [];   // volume for each voice from midi controller 7
    var midiPan = [];   // panning for each voice from midi controller 10
    var midiInstr = []; // instrument for each voice from midi program
    var abcElm = null;  // lopende abc element
    var cmpDlg = null;
    var alrtMsg2 = 'Your browser has no Web Audio API -> no playback.';
    var gTempo = 120;
    var hasPan = 1, hasLFO = 1, hasFlt = 1, hasVCF = 1; // web audio api support
    var gAccTime;       // som van de ABC tijden in millisecondes (plus de starttijd)
    var instMap;        // midi-instrument => midi-instrument voor dynamische klankverandering
    var debug = 0;      // print debug messages
    var tabHaak;        // functie strtab.set_Hooks als module strtab geladen is
    const svg36 = ['%%beginsvg','<defs>',
    '<text id="acc1_3" x="-1">&#xe261; <tspan x="-6" y="-4" style="font-size:14px">&#8593;</tspan></text>',
    '<text id="acc2_3" x="-1">&#xe262; <tspan x="-5" y="14" style="font-size:14px">&#8595;</tspan></text>',
    '<text id="acc4_3" x="-1">&#xe262; <tspan x="-5" y="-4" style="font-size:14px">&#8593;</tspan></text>',
    '<text id="acc-4_3" x="-2">&#xe260; <tspan x="-8.2" y="9" style="font-size:16px">&#8595;</tspan></text>',
    '<text id="acc-2_3" x="-1">&#xe260; <tspan x="-7.3" y="-1" style="font-size:16px">&#8593;</tspan></text>',
    '<text id="acc-1_3" x="-1">&#xe261; <tspan x="-2" y="12" style="font-size:14px">&#8595;</tspan></text>',
    '</defs>','%%endsvg'].join ('\n')

function logerr (s) { 
    console.log (s);
    s = s.replaceAll ('\n','<br>').trim ();
    if (!s.endsWith ('<br>')) s += '<br>';
    document.getElementById ('comp').innerHTML += s;
}

function dolayout (abctxt, abc_elm, fplay) {
    var hasMapTab = abctxt.match (/V:\w+\s*tab.*voicemap/s) != null
    if (hasMapTab) {
        delete abc2svg.mhooks ['strtab'];
    } else if (tabHaak) {
        abc2svg.mhooks ['strtab'] = tabHaak;
    }
    const get_playing = () => isPlaying;
    var voiceMapNames;
    if (fplay) {
        if (abctxt.indexOf ('I:percmap') >= 0) abctxt = mLib.perc2map (abctxt);
        if (abctxt.indexOf ('%%map') >= 0) [voiceMapNames, mapTab] = mLib.mapPerc (abctxt);
    }
    if (abctxt.includes ('temperamentequal')) abctxt = svg36 + '\n' + abctxt;
    gAbcSave = abctxt;  // bewaar abc met wijzigingen
    abcElm = abc_elm;
    if (fplay) {
        var abctxtTemp = abctxt;                // only disable maps during model parsing
        for (var vmapnm in voiceMapNames) {     // disable the voicemaps for tablature
            var nm1 = '%%voicemap ' + vmapnm;   // to get correct fractional midi numbers
            var nm2 = nm1.replace ('%voicemap', '_________')
            abctxtTemp = abctxtTemp.replaceAll (nm1, nm2)
        }        
        mLib.doModel (abctxtTemp, opt, gTempo=120, debug, mapTab, logerr);
        midiVol = mLib.midiVol;
        midiPan = mLib.midiPan;
        midiInstr = mLib.midiInstr;
        midiUsedArr = mLib.midiUsedArr;

        instMap = Array (256).fill (1).map ((x,i) => i) // instMap [i] => i
        laadNoot ();
    }
    mLib.doLayout ( abctxt, opt, abc_elm, fplay, abcElm, logerr, addUnlockListener, 
                    get_playing, playBack, dolayout);
}

function playBack (onoff) {
    if (!mLib.ntsSeq.length) return;
    isPlaying = onoff
    if (isPlaying) {
        mLib.start_markeer (audioCtx);
    } else {
        mLib.stop_markeer ();
    }
}

function keyDown (e, abctxt, abc_elm) {
    var key = e.key;
    if (e.altKey || e.ctrlKey || e.shiftKey || key == 'Tab' || key == 'Escape') {  // browser shortcuts
        playBack (0);
        return;
    }
    e.preventDefault ();
    switch (key) {
    case 'ArrowLeft': case 'Left': mLib.naarMaat (-1); break;
    case 'ArrowRight': case 'Right': mLib.naarMaat (1); break;
    case 'ArrowUp': case 'Up': mLib.regelOmhoog (-1); break;
    case 'ArrowDown': case 'Down': mLib.regelOmhoog (1); break;
    case 'm': $('#mbar').click (); break;
    case 't': cmpDlg.style.display = cmpDlg.style.display == 'none' ? 'block' : 'none'; break;
    case ' ':
        if (abc_elm == abcElm) {
            playBack (!isPlaying);
        } else {
            playBack (0);
            dolayout (abctxt, abc_elm, 1);
        }
        break;
    }
}

function parseParams () {
    var prm, ps, p, parstr, i, r;
    prm = document.getElementById ('parms');
    if (prm) prm.style.display = 'none';
    ps = prm ? JSON.parse (prm.innerText) : {} ;
    for (p in ps) opt [p] = ps [p];
    parstr = window.location.href.split ('?'); // look for parameters in the url;
    if (parstr.length > 1) {
        ps = parstr [1].split ('&');
        for (i = 0; i < ps.length; i++) {
            p = ps [i];
            if (p == 'noRT') opt.withRT = 0;
            else if (p == 'nosm') opt.nosm = 1;     // no smooth scrolling
            else if (p == 'noDash') opt.noDash = 1; // hide the dotted line
            else if (p == 'ios') { hasLFO = 0; hasFlt = 0; hasVCF = 0; hasPan = 0; }
            else if (p == 'keyt') opt.keyt = 1;
            else if (r = p.match (/sf2=(\w+)/)) opt.sf2url2 = r [1] + '/';
            else if (p == 'rbm') opt.rbm = 1;
            else if (p == 'burak') { opt.rbm = 1; p_url.burak = 1; }
            else if (p == 'dynvce') opt.dynvce = 1;
        }
    };
}    

function addUnlockListener (elm, type, handler) {
    function unlockAudio (evt){
        elm.removeEventListener ('mousedown', unlockAudio);
        elm.removeEventListener ('touchend', unlockAudio);
        console.log ('event listeners removed from ' + elm.nodeName);
        if (audioCtx && audioCtx.state == 'suspended') {
            audioCtx.resume ().then (function () {
                console.log ('resuming audioContext');
            });
        }
    }
    elm.addEventListener ('mousedown', unlockAudio);
    elm.addEventListener ('touchend', unlockAudio);
    elm.addEventListener (type, handler);
}

function setSynVars () {
    sLib.setSynVars ( audioCtx, opt, midiVol, midiPan, midiInstr, midiUsedArr,
                      opt.withRT, hasPan, hasLFO, hasFlt, hasVCF, instMap,
                      cmpDlg, logerr);
}

function laadNoot () {
    setSynVars ();
    sLib.laadNoot (playBack);   // start playback after loading the notes
}

document.addEventListener ('DOMContentLoaded', async function () {
    mLib.addElms ();
    parseParams ();
    var htmldoc = await fetch (window.location.href);
    var htmltxt = await htmldoc.text ();
    var abcregex = /class[^>]*?abc.*?>(.*?)<\/div/sg;
    var abcfrags = [...htmltxt.matchAll (abcregex)];
    var xs = Array.prototype.slice.call (document.getElementsByClassName ('abc'));
    xs.forEach (function (e, i) {
        var abc_elm = e;    // pas op: innerHTML vervangt '>', '<' en '&'
        var abctxt = abcfrags [i][1];
        abctxt = abctxt.replace ('<!--','').replace ('-->','').trim ();
        abctxt = '%%fullsvg _' + i + '\n' + abctxt; // make xlink references different in each score
        dolayout (abctxt, abc_elm, 0);
        abc_elm.setAttribute ('tabindex', "0");
        abc_elm.addEventListener ('keydown', evt => {
            keyDown (evt, abctxt, abc_elm);
        });
    });
    xs [0].focus ();    // focusseer eerste fragment zodat spatiebalk afspeelt
    abcElm = null;      // forceer dolayout als de spatiebalk meteen in het begin gebruikt wordt
    document.body.addEventListener ('pointerup', function () {
        if (isPlaying) playBack (0);
    }, false);
    tabHaak = abc2svg.mhooks ['strtab']
    window.addEventListener ('resize', function () {
        mLib.setScale ();
        if (mLib.ntsSeq.length) {            // in het begin zijn er geen noten
            mLib.putMarkLoc (mLib.ntsSeq [mLib.iSeq], 2); // 2 == force scroll
        }
    });
    cmpDlg = document.getElementById ('comp');
    var ac = window.AudioContext || window.webkitAudioContext;
    audioCtx = ac != undefined ? new ac () : null;
    var m = ['Your browser does not support:'], m2 = 0;
    if (!audioCtx) { m.push ('* the Web Audio API -> no sound');
    } else {
        if (!audioCtx.createStereoPanner) hasPan = 0;
        if (!audioCtx.createOscillator) hasLFO = 0;
        if (!audioCtx.createBiquadFilter) hasFlt = 0;
        if (!audioCtx.createConstantSource) hasVCF = 0;
        //~ audioCtx.suspend ();   // test suspension
        if (!hasPan) m.push ('* the StereoPanner element');
        if (opt.withRT && !hasLFO) { m.push ('* the Oscillator element'); m2 = 1; }
        if (opt.withRT && !hasFlt) { m.push ('* the BiquadFilter element'); m2 = 1; }
        if (opt.withRT && !hasVCF) { m.push ('* the ConstantSource element'); m2 = 1; }
        if (m2) {
            m.push ('You are probably on iOS, which does not support the Web Audio API.')
            m.push ('Real time synthesis is switched off, falling back to MIDIjs')
            opt.withRT = 0;
        }
    }
    if (m.length > 1) alert (m.join ('\n'));
});

})();
