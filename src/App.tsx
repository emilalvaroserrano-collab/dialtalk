import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bluetooth,
  EllipsisVertical,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Plus,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

type CallState = "idle" | "connecting" | "active" | "error";
const BAR_COUNT = 15;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function elapsed(seconds: number) {
  return \`\${String(Math.floor(seconds / 60)).padStart(2, "0")}:\${String(seconds % 60).padStart(2, "0")}\`;
}

function localTime() {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export default function App() {
  const [callState, setCallState] = useState<CallState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [number, setNumber] = useState("09681789779");
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0.16));

  const roomRef = useRef<Room | null>(null);
  const audioHostRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const isLive = callState === "active";
  const isCalling = callState === "connecting";
  const isBusy = isLive || isCalling;

  const statusText = useMemo(() => {
    if (isCalling) return "Calling...";
    if (isLive) return elapsed(seconds);
    if (callState === "error") return "Call failed";
    return "Ready";
  }, [callState, isCalling, isLive, seconds]);

  useEffect(() => {
    if (!isLive) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isLive]);

  useEffect(() => {
    if (!isLive) {
      setLevels(Array(BAR_COUNT).fill(0.16));
      return;
    }

    const frame = () => {
      const analyser = analyserRef.current;
      if (analyser) {
        const bins = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(bins);

        const next = Array.from({ length: BAR_COUNT }, (_, index) => {
          const start = Math.floor((index * bins.length) / BAR_COUNT);
          const end = Math.max(start + 1, Math.floor(((index + 1) * bins.length) / BAR_COUNT));
          let sum = 0;
          for (let i = start; i < end; i += 1) sum += bins[i] ?? 0;
          const average = sum / (end - start);
          return Math.max(0.12, Math.min(1, average / 150));
        });

        setLevels(next);
      }
      animationRef.current = window.requestAnimationFrame(frame);
    };

    animationRef.current = window.requestAnimationFrame(frame);
    return () => {
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [isLive]);

  useEffect(() => () => {
    roomRef.current?.disconnect();
    if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
    void audioContextRef.current?.close();
  }, []);

  async function connectVisualizer(track: RemoteTrack) {
    const mediaTrack = track.mediaStreamTrack;
    if (!mediaTrack) return;

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
    }

    const context = new AudioContext();
    const stream = new MediaStream([mediaTrack]);
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();

    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);

    audioContextRef.current = context;
    analyserRef.current = analyser;

    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
  }

  async function startCall() {
    if (isBusy) return;

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

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;

        const element = track.attach();
        element.autoplay = true;
        element.muted = !speaker;
        element.dataset.abbieAudio = "1";
        audioHostRef.current?.appendChild(element);

        void connectVisualizer(track);
      });

      room.on(RoomEvent.Disconnected, () => {
        setCallState("idle");
        setMuted(false);
        analyserRef.current = null;
      });

      await room.connect(data.server_url, data.participant_token);
      await room.startAudio();
      await room.localParticipant.setMicrophoneEnabled(true);
      setCallState("active");
    } catch (cause) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      analyserRef.current = null;
      setCallState("error");
      setError(cause instanceof Error ? cause.message : "Call failed.");
    }
  }

  function endCall() {
    roomRef.current?.disconnect();
    roomRef.current = null;
    analyserRef.current = null;
    audioHostRef.current?.replaceChildren();
    setMuted(false);
    setCallState("idle");
  }

  async function toggleMute() {
    if (!roomRef.current || !isLive) return;
    const next = !muted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  function toggleSpeaker() {
    const next = !speaker;
    setSpeaker(next);
    audioHostRef.current
      ?.querySelectorAll<HTMLMediaElement>("[data-abbie-audio]")
      .forEach((element) => {
        element.muted = !next;
      });
  }

  return (
    <main className="min-h-dvh bg-[#080910] text-white sm:grid sm:place-items-center sm:bg-[#11131a] sm:p-6">
      <div ref={audioHostRef} className="hidden" aria-hidden="true" />

      <section className="relative min-h-dvh w-full overflow-hidden bg-[#090a12] sm:min-h-[840px] sm:max-w-[430px] sm:rounded-[38px] sm:border-[8px] sm:border-black sm:shadow-[0_40px_100px_rgba(0,0,0,.55)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_72%,rgba(104,116,221,.52),transparent_34%),radial-gradient(circle_at_88%_24%,rgba(98,24,74,.44),transparent_30%),radial-gradient(circle_at_90%_82%,rgba(238,157,96,.28),transparent_27%),linear-gradient(180deg,#080812_0%,#161328_45%,#7d7b8c_85%,#8d8992_100%)]" />
        <div className="absolute inset-0 bg-black/5 backdrop-blur-[1.5px]" />

        <div className="relative z-10 flex min-h-dvh flex-col px-7 pb-[max(26px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))] sm:min-h-[824px]">
          <div className="flex items-center justify-between text-[15px] font-medium text-white/95">
            <span>{localTime()}</span>
            <div className="flex items-center gap-2 text-xs text-white/85">
              <span className="size-2 rounded-full bg-white/90" />
              <span className="font-semibold">5G</span>
              <span className="tracking-[-2px]">▮▮▮▮</span>
              <span className="rounded-md bg-white/75 px-2 py-0.5 text-[11px] font-bold text-black">31</span>
            </div>
          </div>

          <div className="mt-14 flex items-center justify-center gap-3 text-[18px] text-white/90">
            <span className="rounded-md bg-white px-1.5 py-0.5 text-[12px] font-black text-[#22252b]">HD</span>
            <span>{statusText}</span>
            <Video className="ml-4 size-6 fill-white/30 text-white/30" />
          </div>

          <div className="mt-20 text-center">
            <input
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              disabled={isBusy}
              inputMode="tel"
              aria-label="Phone number"
              className="w-full border-0 bg-transparent text-center text-[clamp(2.6rem,11vw,4rem)] font-normal tracking-[-0.035em] text-white outline-none disabled:opacity-100"
            />
            <p className="mt-2 text-[24px] font-normal text-white/95">Philippines</p>
          </div>

          <div className="mt-10 flex h-16 items-center justify-center gap-[5px]" aria-label="Audio visualizer">
            {levels.map((level, index) => (
              <span
                key={index}
                className={cx(
                  "w-[5px] rounded-full transition-[height,opacity] duration-75",
                  isLive ? "bg-white/95" : isCalling ? "bg-white/45" : "bg-white/18",
                )}
                style={{
                  height: \`\${10 + level * 42}px\`,
                  opacity: isLive ? 0.72 + level * 0.28 : 0.6,
                }}
              />
            ))}
          </div>

          <div className="mt-auto grid grid-cols-3 gap-x-8 gap-y-9">
            <CallControl icon={<Plus className="size-9" strokeWidth={1.8} />} label="Add call" disabled />
            <CallControl
              icon={muted ? <MicOff className="size-8" strokeWidth={1.9} /> : <Mic className="size-8" strokeWidth={1.9} />}
              label={muted ? "Unmute" : "Mute"}
              active={muted}
              onClick={toggleMute}
              disabled={!isLive}
            />
            <CallControl icon={<Bluetooth className="size-9" strokeWidth={1.9} />} label="Bluetooth" />

            <CallControl
              icon={speaker ? <Volume2 className="size-8" strokeWidth={1.9} /> : <VolumeX className="size-8" strokeWidth={1.9} />}
              label="Speaker"
              active={speaker && isLive}
              onClick={toggleSpeaker}
              disabled={!isLive}
            />
            <CallControl icon={<DialpadDots />} label="Keypad" />
            <CallControl icon={<EllipsisVertical className="size-8" strokeWidth={2.2} />} label="More" />
          </div>

          <div className="mt-12 flex flex-col items-center">
            {isBusy ? (
              <button
                type="button"
                onClick={endCall}
                className="grid size-[88px] place-items-center rounded-full bg-[#ef3831] shadow-[0_18px_45px_rgba(239,56,49,.28)] transition active:scale-95"
                aria-label="End call"
              >
                <PhoneOff className="size-10 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startCall}
                className="grid size-[88px] place-items-center rounded-full bg-[#2dbf68] shadow-[0_18px_45px_rgba(45,191,104,.22)] transition active:scale-95"
                aria-label="Start call"
              >
                <Phone className="size-10 fill-current" />
              </button>
            )}

            {error ? (
              <p className="mt-5 max-w-[300px] rounded-xl bg-black/25 px-4 py-2 text-center text-sm text-red-100 ring-1 ring-red-300/20">
                {error}
              </p>
            ) : (
              <p className="mt-4 text-xs text-white/45">
                {isLive ? \`Connected to Abbie · \${elapsed(seconds)}\` : isCalling ? "Connecting to Abbie..." : "Tap to call Abbie"}
              </p>
            )}
          </div>

          <div className="mt-10 flex items-end justify-between px-10 text-white/85 sm:hidden">
            <span className="text-[28px] tracking-[-8px]">|||</span>
            <span className="size-8 rounded-full border-[2px] border-white/80" />
            <span className="text-[52px] font-light leading-[.65]">‹</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function CallControl({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cx("flex flex-col items-center transition", disabled && "opacity-40")}
    >
      <span
        className={cx(
          "grid size-[82px] place-items-center rounded-[28px] text-white transition active:scale-95",
          active ? "bg-white/26" : "bg-black/23",
        )}
      >
        {icon}
      </span>
      <span className="mt-3 text-[16px] text-white/95">{label}</span>
    </button>
  );
}

function DialpadDots() {
  return (
    <span className="grid grid-cols-3 gap-[5px]">
      {Array.from({ length: 12 }).map((_, index) => (
        <i
          key={index}
          className={cx(
            "size-[5px] rounded-full",
            index === 9 || index === 11 ? "bg-transparent" : "bg-current",
          )}
        />
      ))}
    </span>
  );
}
