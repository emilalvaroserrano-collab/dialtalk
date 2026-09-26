import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity, BadgeCheck, BarChart3, Bell, Bot, Check, ChevronRight, Clock3,
  ContactRound, Headphones, KeyRound, LayoutDashboard, Mic, MicOff,
  MoreHorizontal, Phone, PhoneCall, PhoneOff, Search, Settings, ShieldCheck,
  Sparkles, Users, Volume2, VolumeX,
} from "lucide-react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

type CallState = "idle" | "connecting" | "active" | "error";
type TranscriptItem = {
  id: string;
  speaker: "customer" | "abbie" | "system";
  text: string;
  at: string;
};

const queue = [
  ["Maya Chen", "Northstar Retail", "Billing + automation", "00:38", "Priority"],
  ["Liam Brooks", "Atlas Dental", "Lead callback", "01:12", "Waiting"],
  ["Sofia Reyes", "Verde Kitchen", "WhatsApp reconnect", "02:03", "Waiting"],
  ["Noah Patel", "Kinetic Labs", "New automation", "03:20", "Lead"],
];

const keypad = [
  ["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"],
  ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""],
  ["0", "+"], ["#", ""],
];

const initialTranscript: TranscriptItem[] = [
  { id: "1", speaker: "system", text: "KYC complete · identity, account, and consent verified", at: "11:24" },
  { id: "2", speaker: "abbie", text: "Yep, perfect. I've got you. So tell me — what's happening on your side?", at: "11:24" },
  { id: "3", speaker: "customer", text: "Our Facebook leads are coming in, but the automatic calls stopped yesterday.", at: "11:25" },
  { id: "4", speaker: "abbie", text: "Ahh... okay. Leads are reaching the CRM, but the callback isn't firing. Gotcha.", at: "11:25" },
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
function now() {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
function elapsed(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function App() {
  const [callState, setCallState] = useState<CallState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [number, setNumber] = useState("+63 917 555 0138");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>(initialTranscript);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (callState !== "active") return;
    const id = window.setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [callState]);

  useEffect(() => () => roomRef.current?.disconnect(), []);

  async function startCall() {
    if (callState === "active" || callState === "connecting") return;
    setCallState("connecting");
    setSeconds(0);
    setError(null);

    try {
      const response = await fetch("/api/livekit-token", { method: "POST" });
      const data = await response.json() as {
        server_url?: string;
        participant_token?: string;
        error?: string;
      };
      if (!response.ok || !data.server_url || !data.participant_token) {
        throw new Error(data.error || "Could not create a LiveKit session.");
      }

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.autoplay = true;
        element.muted = !speaker;
        element.dataset.abbieAudio = "1";
        audioRef.current?.appendChild(element);
      });

      room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        for (const segment of segments) {
          if (!segment.text || segment.final === false) continue;
          setTranscript((items) => items.concat({
            id: segment.id || `${Date.now()}-${Math.random()}`,
            speaker: participant?.identity?.toLowerCase().includes("agent") ? "abbie" : "customer",
            text: segment.text,
            at: now(),
          }).slice(-40));
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        setCallState("idle");
        setMuted(false);
      });

      await room.connect(data.server_url, data.participant_token);
      await room.startAudio();
      await room.localParticipant.setMicrophoneEnabled(true);
      setCallState("active");
      setTranscript((items) => items.concat({
        id: `system-${Date.now()}`,
        speaker: "system",
        text: "Secure LiveKit room connected · AbbieCSR dispatched",
        at: now(),
      }));
    } catch (cause) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      setCallState("error");
      setError(cause instanceof Error ? cause.message : "Call failed.");
    }
  }

  function endCall() {
    roomRef.current?.disconnect();
    roomRef.current = null;
    audioRef.current?.replaceChildren();
    setMuted(false);
    setCallState("idle");
  }

  async function toggleMute() {
    if (!roomRef.current || callState !== "active") return;
    const next = !muted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  function toggleSpeaker() {
    const next = !speaker;
    setSpeaker(next);
    audioRef.current?.querySelectorAll<HTMLMediaElement>("[data-abbie-audio]")
      .forEach((element) => { element.muted = !next; });
  }

  return (
    <main className="min-h-dvh bg-[#f4f6f8] text-slate-950">
      <div ref={audioRef} className="hidden" aria-hidden="true" />

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1680px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-slate-950 text-white">
              <Headphones className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <b>DialTalk</b>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Abbie CSR</span>
              </div>
              <p className="text-xs text-slate-500">ABI Tech · Customer Operations</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={cx(
              "hidden rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex",
              callState === "active" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700",
            )}>
              <i className={cx("mr-2 mt-1 size-2 rounded-full", callState === "active" ? "bg-blue-500" : "bg-emerald-500")} />
              {callState === "active" ? "On call" : callState === "connecting" ? "Connecting" : "Agent ready"}
            </span>
            <button className="grid size-9 place-items-center rounded-xl border border-slate-200"><Bell className="size-4" /></button>
            <div className="grid size-9 place-items-center rounded-xl bg-slate-950 text-xs font-bold text-white">AE</div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1680px] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100dvh-4rem)] border-r border-slate-200 bg-white p-4 lg:flex lg:flex-col">
          <nav className="space-y-1">
            <Nav icon={LayoutDashboard} label="Overview" active />
            <Nav icon={PhoneCall} label="Calls" />
            <Nav icon={Users} label="Customers" />
            <Nav icon={BarChart3} label="QA & Insights" />
            <Nav icon={Settings} label="Settings" />
          </nav>

          <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><Bot className="size-4" />AbbieCSR</div>
            <div className="mt-3 flex justify-between text-xs text-slate-500"><span>Voice runtime</span><b className="text-emerald-600">LiveKit</b></div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-200"><div className="h-full w-[88%] rounded-full bg-slate-950" /></div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">KYC-first voice flow, realtime transcript, server-side token signing.</p>
          </div>
        </aside>

        <section className="min-w-0 p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-400">Operations</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Call Center Dashboard</h1>
              <p className="mt-1 text-sm text-slate-500">Queue, KYC, call context, transcript, and Abbie voice controls.</p>
            </div>
            <div className="flex gap-2">
              <button className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium"><Search className="size-4" />Search</button>
              <button onClick={startCall} className="flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white"><Phone className="size-4" />New call</button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={PhoneCall} label="Active calls" value={callState === "active" ? "05" : "04"} note="Across voice channels" />
            <Metric icon={Clock3} label="Waiting" value="12" note="Longest wait 03:20" />
            <Metric icon={Activity} label="Avg. handle" value="04:21" note="-18 sec vs yesterday" />
            <Metric icon={ShieldCheck} label="KYC pass" value="96.4%" note="Verified first contact" />
          </div>

          <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_370px]">
            <div className="min-w-0 space-y-5">
              <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
                <Card title="Queue" subtitle="Customers waiting for a CSR">
                  <div className="divide-y divide-slate-100">
                    {queue.map((row, i) => (
                      <button key={row[0]} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 sm:px-5">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={cx("grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold", i === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")}>
                            {row[0].split(" ").map((part) => part[0]).join("")}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{row[0]} <span className="font-normal text-slate-400">· {row[1]}</span></p>
                            <p className="truncate text-xs text-slate-500">{row[2]}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-xs">{row[3]}</p>
                          <span className={cx(
                            "mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold",
                            row[4] === "Priority" ? "bg-rose-50 text-rose-600" : row[4] === "Lead" ? "bg-violet-50 text-violet-600" : "bg-slate-100 text-slate-500",
                          )}>{row[4]}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid size-11 place-items-center rounded-full bg-slate-950 text-sm font-bold text-white">MC</div>
                      <div><h2 className="font-semibold">Maya Chen</h2><p className="text-xs text-slate-500">Northstar Retail · Existing client</p></div>
                    </div>
                    <MoreHorizontal className="size-4 text-slate-400" />
                  </div>

                  <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><BadgeCheck className="size-4" />KYC verified</span>
                      <b className="text-[10px] tracking-wider text-emerald-700">PASS</b>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {["Identity", "Account", "Consent"].map((item) => <div key={item} className="rounded-lg bg-white/70 p-2 text-center text-[11px] font-medium text-emerald-800"><Check className="mx-auto mb-1 size-3.5" />{item}</div>)}
                    </div>
                  </div>

                  <dl className="mt-4 text-sm">
                    <Detail label="Issue" value="Lead callback stopped" />
                    <Detail label="Last contact" value="Yesterday · 16:08" />
                    <Detail label="Plan" value="Automation Growth" />
                    <Detail label="Sentiment" value="Frustrated, cooperative" />
                  </dl>

                  <div className="mt-4 rounded-xl bg-slate-950 p-3 text-white">
                    <p className="flex items-center gap-2 text-xs font-semibold text-slate-300"><Sparkles className="size-3.5" />Suggested next move</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-100">Confirm the lead reaches CRM, then inspect the callback trigger before changing Meta authorization.</p>
                  </div>
                </div>
              </div>

              <Card title="Live conversation" subtitle="Realtime speech transcript from the LiveKit room">
                <div className="max-h-[420px] min-h-[310px] space-y-4 overflow-y-auto p-4 sm:p-5">
                  {transcript.map((item) => (
                    <div key={item.id} className={cx("flex gap-3", item.speaker === "customer" && "justify-end")}>
                      {item.speaker !== "customer" && (
                        <div className={cx("mt-1 grid size-7 shrink-0 place-items-center rounded-full", item.speaker === "abbie" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500")}>
                          {item.speaker === "abbie" ? <Bot className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
                        </div>
                      )}
                      <div className={cx("max-w-[80%]", item.speaker === "customer" && "text-right")}>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.speaker === "customer" ? "Customer" : item.speaker === "abbie" ? "Abbie" : "System"} · {item.at}</p>
                        <p className={cx("rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed", item.speaker === "customer" ? "rounded-tr-md bg-slate-950 text-white" : item.speaker === "abbie" ? "rounded-tl-md bg-slate-100 text-slate-800" : "border border-dashed border-slate-200 text-slate-500")}>{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <PhonePanel
              callState={callState}
              seconds={seconds}
              number={number}
              setNumber={setNumber}
              muted={muted}
              speaker={speaker}
              error={error}
              startCall={startCall}
              endCall={endCall}
              toggleMute={toggleMute}
              toggleSpeaker={toggleSpeaker}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Nav({ icon: Icon, label, active = false }: { icon: typeof LayoutDashboard; label: string; active?: boolean }) {
  return <button className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium", active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100")}><Icon className="size-4" />{label}</button>;
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5"><div><h2 className="font-semibold">{title}</h2><p className="text-xs text-slate-500">{subtitle}</p></div><ChevronRight className="size-4 text-slate-300" /></div>{children}</section>;
}

function Metric({ icon: Icon, label, value, note }: { icon: typeof PhoneCall; label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex justify-between"><div className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon className="size-4" /></div><ChevronRight className="size-4 text-slate-300" /></div><p className="mt-4 text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="mt-1 text-[11px] text-slate-400">{note}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}

function PhonePanel(props: {
  callState: CallState;
  seconds: number;
  number: string;
  setNumber: (value: string) => void;
  muted: boolean;
  speaker: boolean;
  error: string | null;
  startCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
}) {
  const { callState, seconds, number, setNumber, muted, speaker, error, startCall, endCall, toggleMute, toggleSpeaker } = props;
  const active = callState === "active";
  const connecting = callState === "connecting";

  return (
    <aside className="2xl:sticky 2xl:top-20 2xl:self-start">
      <div className="mb-3 flex items-center justify-between px-1">
        <div><h2 className="font-semibold">Agent dialer</h2><p className="text-xs text-slate-500">LiveKit voice test handset</p></div>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Mobile mockup</span>
      </div>

      <div className="mx-auto w-full max-w-[350px] rounded-[42px] border-[8px] border-slate-950 bg-slate-950 p-1 shadow-2xl">
        <div className="relative min-h-[650px] overflow-hidden rounded-[32px] bg-[#0b0f14] text-white">
          <div className="absolute left-1/2 top-2 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
          <div className="flex justify-between px-5 pb-2 pt-3 text-[10px] font-semibold text-slate-300"><span>11:31</span><span>5G ▰</span></div>

          {!active && !connecting ? (
            <div className="px-5 pb-6 pt-4">
              <div className="text-center">
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-slate-800"><ContactRound className="size-7" /></div>
                <p className="mt-3 text-lg font-semibold">Abbie CSR</p>
                <p className="text-xs text-slate-400">ABI Tech customer service line</p>
              </div>

              <div className="mt-5 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Number / test label</label>
                <input value={number} onChange={(event) => setNumber(event.target.value)} className="mt-1 w-full bg-transparent text-center text-lg font-medium outline-none" inputMode="tel" />
              </div>

              <div className="mt-5 grid grid-cols-3 gap-x-5 gap-y-3 px-2">
                {keypad.map(([digit, letters]) => (
                  <button key={digit} onClick={() => setNumber(number + digit)} className="mx-auto grid size-16 place-items-center rounded-full bg-white/10 text-xl active:bg-white/20">
                    <span>{digit}<small className="mt-1 block text-[8px] font-bold tracking-[.2em] text-slate-400">{letters}</small></span>
                  </button>
                ))}
              </div>

              <button onClick={startCall} className="mx-auto mt-5 grid size-16 place-items-center rounded-full bg-emerald-500"><Phone className="size-7 fill-current" /></button>
              {error && <p className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-300 ring-1 ring-rose-500/20">{error}</p>}
              <p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-slate-500"><KeyRound className="size-3" />JWT minted server-side</p>
            </div>
          ) : (
            <div className="flex min-h-[600px] flex-col px-5 pb-7 pt-10">
              <div className="text-center">
                <div className="mx-auto grid size-20 place-items-center rounded-full bg-slate-800"><Bot className="size-9" /></div>
                <p className="mt-4 text-xl font-semibold">Abbie</p>
                <p className="mt-1 text-sm text-slate-400">{connecting ? "Connecting securely..." : elapsed(seconds)}</p>
              </div>

              <div className="mt-10 flex h-14 items-center justify-center gap-1.5">
                {[18, 30, 42, 24, 48, 34, 20, 38, 28, 44, 23].map((height, i) => <span key={i} className={cx("w-1 rounded-full", active ? "animate-pulse bg-emerald-400" : "bg-slate-700")} style={{ height }} />)}
              </div>

              <p className="mt-3 text-center text-xs text-slate-500">{active ? "AbbieCSR connected · realtime audio" : "Creating room and dispatching agent"}</p>

              <div className="mt-auto grid grid-cols-3 gap-5">
                <Control label={muted ? "Unmute" : "Mute"} icon={muted ? MicOff : Mic} active={muted} onClick={toggleMute} />
                <Control label="Keypad" icon={MoreHorizontal} />
                <Control label={speaker ? "Speaker" : "Speaker off"} icon={speaker ? Volume2 : VolumeX} active={speaker} onClick={toggleSpeaker} />
              </div>

              <button onClick={endCall} className="mx-auto mt-8 grid size-16 place-items-center rounded-full bg-rose-500"><PhoneOff className="size-7 fill-current" /></button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function Control({ label, icon: Icon, active = false, onClick }: { label: string; icon: typeof Mic; active?: boolean; onClick?: () => void }) {
  return <button onClick={onClick} className="text-center"><span className={cx("mx-auto grid size-14 place-items-center rounded-full", active ? "bg-white text-slate-950" : "bg-white/10 text-white")}><Icon className="size-5" /></span><span className="mt-2 block text-[10px] text-slate-400">{label}</span></button>;
}
