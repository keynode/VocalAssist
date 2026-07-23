import { WorkletSynthesizer } from "spessasynth_lib";

const GUIDE_CHANNEL = 16;
const GUIDE_PROGRAM = 73; // General MIDI flute
const ALL_NOTES_OFF = 123;
const CHANNEL_VOLUME = 7;

const clampMidi = value => Math.max(0, Math.min(127, Math.round(value)));
const lowerBound = (events, q) => {
  let lo = 0, hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].q < q - 1e-6) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};
const normalizeEvent = event => {
  if (!Array.isArray(event)) return event;
  const track = event[1], channel = event[2];
  return {
    q: event[0],
    track,
    channel: channel < 0 ? null : channel,
    groupKey: channel < 0 ? null : `${track}:${channel}`,
    kind: event[3] === 2 ? "sysex" : event[3] === 1 ? "note" : "state",
    data: event.slice(4),
  };
};

class MidiAudioEngine {
  constructor(context, destination, synth) {
    this.context = context;
    this.destination = destination;
    this.synth = synth;
    this.events = [];
    this.guideEvents = [];
    this.selectedKeys = new Set();
    this.eventIndex = 0;
    this.guideIndex = 0;
    this.transpose = 0;
    this.voxVolume = 0.6;
    this.accVolume = 0.45;
    this.channelVolumes = new Array(16).fill(100);
    this.playing = false;
  }

  static async create({ context, destination, workletUrl, soundBankBuffer }) {
    await context.audioWorklet.addModule(workletUrl);
    const synth = new WorkletSynthesizer(context);
    synth.setLogLevel(false, true, false);
    synth.connect(destination);
    await synth.isReady;
    synth.addNewChannel();
    await synth.soundBankManager.addSoundBank(soundBankBuffer, "vocalassist-main");
    return new MidiAudioEngine(context, destination, synth);
  }

  destroy() {
    this.playing = false;
    try { this.synth.stopAll(true); } catch (_) {}
    try { this.synth.disconnect(this.destination); } catch (_) {}
    try { this.synth.destroy(); } catch (_) {}
  }

  stop() {
    this.playing = false;
    this.synth.stopAll(true);
  }

  setVolumes(voxVolume, accVolume) {
    this.voxVolume = Math.max(0, Math.min(1, Number(voxVolume) || 0));
    this.accVolume = Math.max(0, Math.min(1, Number(accVolume) || 0));
    for (let channel = 0; channel < 16; channel++) this.sendScaledVolume(channel);
    this.synth.controllerChange(GUIDE_CHANNEL, CHANNEL_VOLUME, clampMidi(127 * this.voxVolume));
  }

  previewNote(note, duration = 0.6) {
    const now = this.context.currentTime;
    const midiNote = clampMidi(note);
    this.synth.programChange(GUIDE_CHANNEL, GUIDE_PROGRAM);
    this.synth.controllerChange(GUIDE_CHANNEL, CHANNEL_VOLUME, clampMidi(127 * this.voxVolume));
    this.synth.noteOn(GUIDE_CHANNEL, midiNote, 104, { time: now });
    this.synth.noteOff(GUIDE_CHANNEL, midiNote, { time: now + Math.max(0.05, duration) });
  }

  sendScaledVolume(channel, time) {
    const value = clampMidi(this.channelVolumes[channel] * this.accVolume);
    this.synth.controllerChange(channel, CHANNEL_VOLUME, value, time == null ? undefined : { time });
  }

  makeGuideEvents(melody) {
    const result = [];
    for (const note of melody || []) {
      const q = Number(note[0]), duration = Math.max(0.01, Number(note[1]) || 0.01);
      result.push({ q, on: true, note: clampMidi(note[2]) });
      result.push({ q: q + duration, on: false, note: clampMidi(note[2]) });
    }
    result.sort((a, b) => a.q - b.q || Number(a.on) - Number(b.on));
    return result;
  }

  begin({ events, melody, selectedKeys, q, qPerSec, contextStart, transpose, voxVolume, accVolume }) {
    this.synth.stopAll(true);
    this.synth.reset();
    this.events = Array.isArray(events) ? events.map(normalizeEvent) : [];
    this.guideEvents = this.makeGuideEvents(melody);
    this.selectedKeys = new Set(selectedKeys || []);
    this.transpose = Math.round(Number(transpose) || 0);
    this.channelVolumes.fill(100);

    for (const event of this.events) {
      if (event.q >= q - 1e-6) break;
      if (event.kind !== "note") this.sendEvent(event, undefined, true);
    }

    this.synth.programChange(GUIDE_CHANNEL, GUIDE_PROGRAM);
    this.setVolumes(voxVolume, accVolume);
    this.eventIndex = lowerBound(this.events, q);
    this.guideIndex = lowerBound(this.guideEvents, q);
    this.playing = true;

    // If seeking into a sustained guide note, start its remaining tail immediately.
    for (const note of melody || []) {
      if (note[0] < q && q < note[0] + note[1]) {
        const offTime = contextStart + (note[0] + note[1] - q) / qPerSec;
        this.synth.noteOn(GUIDE_CHANNEL, clampMidi(note[2]), 104);
        this.synth.noteOff(GUIDE_CHANNEL, clampMidi(note[2]), { time: offTime });
      }
    }
  }

  updateSelection({ selectedKeys, melody, q, qPerSec }) {
    const next = new Set(selectedKeys || []);
    const changed = new Set([...this.selectedKeys, ...next].filter(key => this.selectedKeys.has(key) !== next.has(key)));
    const affectedChannels = new Set();
    for (const event of this.events) if (changed.has(event.groupKey) && event.channel != null) affectedChannels.add(event.channel);
    for (const channel of affectedChannels) this.synth.controllerChange(channel, ALL_NOTES_OFF, 0);
    this.synth.controllerChange(GUIDE_CHANNEL, ALL_NOTES_OFF, 0);
    this.selectedKeys = next;
    this.guideEvents = this.makeGuideEvents(melody);
    this.guideIndex = lowerBound(this.guideEvents, q);
    const speed = Math.max(0.01, Number(qPerSec) || 1);
    for (const note of melody || []) {
      if (note[0] < q && q < note[0] + note[1]) {
        const midiNote = clampMidi(note[2]);
        this.synth.noteOn(GUIDE_CHANNEL, midiNote, 104);
        this.synth.noteOff(GUIDE_CHANNEL, midiNote, { time: this.context.currentTime + (note[0] + note[1] - q) / speed });
      }
    }
  }

  schedule({ currentQ, lookAheadQ, qPerSec, contextStart, startQ }) {
    if (!this.playing) return;
    const limit = currentQ + lookAheadQ;
    while (this.eventIndex < this.events.length && this.events[this.eventIndex].q <= limit) {
      const event = this.events[this.eventIndex++];
      if (event.q < currentQ - 0.03) continue;
      const time = Math.max(this.context.currentTime + 0.002, contextStart + (event.q - startQ) / qPerSec);
      this.sendEvent(event, time, false);
    }
    while (this.guideIndex < this.guideEvents.length && this.guideEvents[this.guideIndex].q <= limit) {
      const event = this.guideEvents[this.guideIndex++];
      if (event.q < currentQ - 0.03) continue;
      const time = Math.max(this.context.currentTime + 0.002, contextStart + (event.q - startQ) / qPerSec);
      if (event.on) this.synth.noteOn(GUIDE_CHANNEL, event.note, 104, { time });
      else this.synth.noteOff(GUIDE_CHANNEL, event.note, { time });
    }
  }

  sendEvent(event, time, restoring) {
    const options = time == null ? undefined : { time };
    if (event.kind === "sysex") {
      this.synth.systemExclusive(event.data, 0, options);
      if (!restoring) {
        const volumeTime = time == null ? undefined : time + 0.0001;
        for (let channel = 0; channel < 16; channel++) this.sendScaledVolume(channel, volumeTime);
        this.synth.programChange(GUIDE_CHANNEL, GUIDE_PROGRAM, volumeTime == null ? undefined : { time: volumeTime });
        this.synth.controllerChange(GUIDE_CHANNEL, CHANNEL_VOLUME, clampMidi(127 * this.voxVolume), volumeTime == null ? undefined : { time: volumeTime });
      }
      return;
    }
    const data = event.data || [];
    const status = data[0] || 0;
    const command = status & 0xf0;
    const channel = event.channel == null ? status & 0x0f : event.channel;
    if (command === 0xb0 && data[1] === CHANNEL_VOLUME) {
      this.channelVolumes[channel] = data[2];
      this.sendScaledVolume(channel, time);
      return;
    }
    if (event.kind === "note") {
      if (restoring || this.selectedKeys.has(event.groupKey)) return;
      const adjusted = data.slice();
      if (channel !== 9) adjusted[1] = clampMidi(adjusted[1] + this.transpose);
      this.synth.sendMessage(adjusted, 0, options);
      return;
    }
    const adjusted = data.slice();
    if (command === 0xa0 && channel !== 9) adjusted[1] = clampMidi(adjusted[1] + this.transpose);
    this.synth.sendMessage(adjusted, 0, options);
  }
}

window.VocalAssistMidiAudio = { MidiAudioEngine };
