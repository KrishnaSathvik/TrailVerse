'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://trailverse.onrender.com/api'
    : 'http://localhost:5001/api');

const REALTIME_API_URL = 'https://api.openai.com/v1/realtime/calls';
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const MIC_COOLDOWN_MS = 1200;
const MIN_SPEECH_MS = 500;

// Cache geolocation at module level — only request once per page session
let cachedLocation = null;
let locationRequested = false;

async function getCachedLocation() {
  if (cachedLocation) return cachedLocation;
  if (locationRequested) return null;
  if (!navigator.geolocation) return null;

  locationRequested = true;
  try {
    cachedLocation = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 2000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
        { timeout: 2000, maximumAge: 600000 }
      );
    });
    return cachedLocation;
  } catch (_) {
    return null;
  }
}

/**
 * Hook states: idle → connecting → connected → speaking → listening → error
 * UI chrome must NOT own this hook — mount once in VoiceSessionProvider.
 */
export default function useRealtimeVoice() {
  const [status, setStatus] = useState('idle');
  const [transcript, setTranscript] = useState([]);
  const [isTrailieSpeaking, setIsTrailieSpeaking] = useState(false);
  const [isToolCalling, setIsToolCalling] = useState(false);
  const [toolCallInfo, setToolCallInfo] = useState(null);
  const [error, setError] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [userMuted, setUserMuted] = useState(false);
  const [bargeInEnabled, setBargeInEnabled] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const handlerRef = useRef(null);
  const connectGenRef = useRef(0);
  const toolTokenRef = useRef(null);
  const userMutedRef = useRef(false);
  const bargeInRef = useRef(false);
  const activeFnCallRef = useRef(null);
  const micCooldownRef = useRef(null);
  const responseActiveRef = useRef(false);
  const speechStartRef = useRef(null);
  const idleTimerRef = useRef(null);
  const analyserRef = useRef(null);
  const analyserCtxRef = useRef(null);
  const analyserRafRef = useRef(null);
  const remoteAnalyserRef = useRef(null);
  const levelSourceRef = useRef('none'); // mic | remote | none

  const bumpIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!pcRef.current) return;
      connectGenRef.current += 1;
      stopAnalyser();
      cleanupMedia();
      setIsTrailieSpeaking(false);
      setIsToolCalling(false);
      setToolCallInfo(null);
      setUserMuted(false);
      userMutedRef.current = false;
      setError('Voice session ended after inactivity. Tap Retry to reconnect.');
      setStatus('error');
    }, IDLE_TIMEOUT_MS);
  }, []);

  function stopAnalyser() {
    if (analyserRafRef.current) {
      cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    analyserRef.current = null;
    remoteAnalyserRef.current = null;
    if (analyserCtxRef.current) {
      try {
        analyserCtxRef.current.close();
      } catch (_) {}
      analyserCtxRef.current = null;
    }
    levelSourceRef.current = 'none';
    setAudioLevel(0);
  }

  function startAnalyserLoop() {
    if (analyserRafRef.current) return;
    const tick = () => {
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (prefersReduced) {
        setAudioLevel(0);
        analyserRafRef.current = requestAnimationFrame(tick);
        return;
      }

      let level = 0;
      const useRemote = levelSourceRef.current === 'remote' && remoteAnalyserRef.current;
      const analyser = useRemote ? remoteAnalyserRef.current : analyserRef.current;
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        level = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
      }
      setAudioLevel((prev) => prev * 0.6 + level * 0.4);
      analyserRafRef.current = requestAnimationFrame(tick);
    };
    analyserRafRef.current = requestAnimationFrame(tick);
  }

  function attachMicAnalyser(stream) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = analyserCtxRef.current || new Ctx();
      analyserCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      startAnalyserLoop();
    } catch (_) {
      // Visualization is optional
    }
  }

  function attachRemoteAnalyser(mediaStream) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx || !mediaStream) return;
      const ctx = analyserCtxRef.current || new Ctx();
      analyserCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(mediaStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      remoteAnalyserRef.current = analyser;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      startAnalyserLoop();
    } catch (_) {}
  }

  function cleanupMedia() {
    if (dcRef.current) {
      try {
        dcRef.current.close();
      } catch (_) {}
      dcRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (_) {}
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      if (audioRef.current.parentNode) audioRef.current.parentNode.removeChild(audioRef.current);
      audioRef.current = null;
    }
    activeFnCallRef.current = null;
    responseActiveRef.current = false;
    toolTokenRef.current = null;
    if (micCooldownRef.current) {
      clearTimeout(micCooldownRef.current);
      micCooldownRef.current = null;
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function cleanup() {
    stopAnalyser();
    cleanupMedia();
  }

  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only teardown
  }, []);

  function setMicTracksEnabled(enabled) {
    if (!streamRef.current) return;
    // User mute always wins over auto mute/unmute during speaking
    const next = Boolean(enabled) && !userMutedRef.current;
    streamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
  }

  async function executeFunctionCall(callId, fnName, fnArgs) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (toolTokenRef.current) {
        headers.Authorization = `Bearer ${toolTokenRef.current}`;
        headers['X-TrailVerse-Voice-Token'] = toolTokenRef.current;
      }

      const res = await fetch(`${API_URL}/ai/voice-tool`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tool: fnName,
          args: fnArgs,
          toolToken: toolTokenRef.current || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      const output =
        res.ok
          ? data.result || data.error || 'No data returned'
          : data.error || `Tool failed (${res.status})`;

      const dc = dcRef.current;
      if (dc && dc.readyState === 'open') {
        dc.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output: typeof output === 'string' ? output : JSON.stringify(output),
            },
          })
        );
        responseActiveRef.current = true;
        dc.send(JSON.stringify({ type: 'response.create' }));
      }
    } catch (err) {
      console.error('[Voice] Function call execution failed:', err.message);
      const dc = dcRef.current;
      if (dc && dc.readyState === 'open') {
        dc.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output: `Error fetching data: ${err.message}`,
            },
          })
        );
        responseActiveRef.current = true;
        dc.send(JSON.stringify({ type: 'response.create' }));
      }
    }
  }

  const connect = useCallback(
    async (parkCode = null) => {
      const gen = ++connectGenRef.current;
      const stale = () => connectGenRef.current !== gen;

      try {
        cleanup();
        setStatus('connecting');
        setError(null);
        setAuthRequired(false);
        setPermissionDenied(false);
        setTranscript([]);
        setIsTrailieSpeaking(false);
        setIsToolCalling(false);
        setToolCallInfo(null);
        setUserMuted(false);
        userMutedRef.current = false;

        const userLocation = await getCachedLocation();
        if (stale()) return;

        const body = {};
        if (parkCode) body.parkCode = parkCode;
        if (userLocation?.lat && userLocation?.lng) {
          body.lat = userLocation.lat;
          body.lng = userLocation.lng;
        }
        const headers = { 'Content-Type': 'application/json' };
        const token =
          typeof localStorage !== 'undefined' &&
          (localStorage.getItem('token') || sessionStorage.getItem('token'));
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/ai/realtime-session`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        if (stale()) return;

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (errData.authRequired) {
            setAuthRequired(true);
            setStatus('error');
            setError(errData.error || 'Sign up to continue using Trailie Voice.');
            return;
          }
          throw new Error(errData.error || `Failed to create session (${res.status})`);
        }

        const sessionData = await res.json();
        const ephemeralKey = sessionData.value;
        toolTokenRef.current = sessionData.toolToken || null;
        const bargeIn = Boolean(sessionData.voiceMeta?.bargeIn);
        bargeInRef.current = bargeIn;
        setBargeInEnabled(bargeIn);

        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        audioEl.setAttribute('playsinline', '');
        if (typeof audioEl.setSinkId === 'function') {
          try {
            await audioEl.setSinkId('default');
          } catch (_) {}
        }
        audioRef.current = audioEl;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);

        pc.ontrack = (event) => {
          const remoteStream = event.streams[0];
          audioEl.srcObject = remoteStream;
          audioEl.play().catch(() => {});
          attachRemoteAnalyser(remoteStream);
        };

        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch (mediaErr) {
          if (mediaErr?.name === 'NotAllowedError' || mediaErr?.name === 'PermissionDeniedError') {
            setPermissionDenied(true);
            throw new Error('Microphone permission denied. Allow mic access to talk to Trailie.');
          }
          throw mediaErr;
        }
        if (stale()) {
          stream.getTracks().forEach((t) => t.stop());
          pc.close();
          return;
        }
        streamRef.current = stream;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        attachMicAnalyser(stream);

        const dc = pc.createDataChannel('oai-events');
        dcRef.current = dc;

        dc.onopen = () => {
          if (!stale()) {
            setStatus('connected');
            bumpIdleTimer();
          }
        };

        dc.onmessage = (e) => {
          if (handlerRef.current) handlerRef.current(e.data);
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (stale()) {
          pc.close();
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const sdpRes = await fetch(REALTIME_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        });
        if (stale()) {
          pc.close();
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (!sdpRes.ok) {
          throw new Error(`WebRTC SDP exchange failed (${sdpRes.status})`);
        }

        const answerSdp = await sdpRes.text();
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            setStatus('error');
            setError('Connection lost');
            cleanup();
          }
        };
      } catch (err) {
        if (stale()) return;
        console.error('[Voice] Connection error:', err.message);
        setStatus('error');
        setError(err.message || 'Connection error');
        cleanup();
      }
    },
    [bumpIdleTimer]
  );

  const disconnect = useCallback(() => {
    connectGenRef.current += 1;
    cleanup();
    setStatus('idle');
    setIsTrailieSpeaking(false);
    setIsToolCalling(false);
    setToolCallInfo(null);
    setUserMuted(false);
    userMutedRef.current = false;
    setPermissionDenied(false);
    setError(null);
    setAuthRequired(false);
  }, []);

  const setMuted = useCallback((muted) => {
    const next = Boolean(muted);
    userMutedRef.current = next;
    setUserMuted(next);
    if (!streamRef.current) return;
    if (next) {
      streamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
      return;
    }
    const blockWhileSpeaking =
      !bargeInRef.current && (responseActiveRef.current || Boolean(micCooldownRef.current));
    streamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !blockWhileSpeaking;
    });
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(!userMutedRef.current);
  }, [setMuted]);

  handlerRef.current = function handleDataChannelMessage(raw) {
    try {
      const event = JSON.parse(raw);

      switch (event.type) {
        case 'input_audio_buffer.speech_started': {
          bumpIdleTimer();
          if (userMutedRef.current) break;

          if (bargeInRef.current && responseActiveRef.current) {
            // Cancel in-flight assistant audio for natural interruption
            const dc = dcRef.current;
            if (dc && dc.readyState === 'open') {
              try {
                dc.send(JSON.stringify({ type: 'response.cancel' }));
              } catch (_) {}
            }
            responseActiveRef.current = false;
            setIsTrailieSpeaking(false);
            if (audioRef.current) {
              try {
                audioRef.current.pause();
                // Resume element for next response
                audioRef.current.play().catch(() => {});
              } catch (_) {}
            }
          } else if (responseActiveRef.current) {
            break;
          }

          if (!bargeInRef.current && streamRef.current?.getAudioTracks()[0]?.enabled === false) break;
          if (micCooldownRef.current) break;
          speechStartRef.current = Date.now();
          levelSourceRef.current = 'mic';
          setStatus('listening');
          break;
        }

        case 'input_audio_buffer.speech_stopped': {
          if (responseActiveRef.current && !bargeInRef.current) break;
          if (!userMutedRef.current && !micCooldownRef.current) {
            setStatus('connected');
          }
          break;
        }

        case 'input_audio_buffer.committed': {
          const speechDuration = speechStartRef.current ? Date.now() - speechStartRef.current : 0;
          speechStartRef.current = null;

          const micEnabled = streamRef.current?.getAudioTracks()[0]?.enabled !== false;
          if (
            speechDuration > MIN_SPEECH_MS &&
            micEnabled &&
            !userMutedRef.current &&
            !micCooldownRef.current &&
            !responseActiveRef.current
          ) {
            const dc = dcRef.current;
            if (dc && dc.readyState === 'open') {
              responseActiveRef.current = true;
              dc.send(JSON.stringify({ type: 'response.create' }));
            }
          }
          break;
        }

        case 'conversation.item.done': {
          if (event.item?.role === 'user') {
            const parts = event.item.content || [];
            const text = parts
              .filter((p) => p.transcript)
              .map((p) => p.transcript.trim())
              .join(' ');
            if (text && text.length > 1) {
              setTranscript((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'user') {
                  return [...prev.slice(0, -1), { role: 'user', text: `${last.text} ${text}` }];
                }
                return [...prev, { role: 'user', text }];
              });
            }
          }
          break;
        }

        case 'output_audio_buffer.started': {
          bumpIdleTimer();
          setIsTrailieSpeaking(true);
          setIsToolCalling(false);
          setToolCallInfo(null);
          setStatus('speaking');
          levelSourceRef.current = 'remote';
          if (!bargeInRef.current) {
            setMicTracksEnabled(false);
          }
          break;
        }

        case 'output_audio_buffer.stopped':
        case 'response.output_audio.done': {
          setIsTrailieSpeaking(false);
          levelSourceRef.current = 'mic';
          break;
        }

        case 'response.output_audio_transcript.delta': {
          const delta = event.delta;
          if (delta) {
            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant' && last.streaming) {
                return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
              }
              return [...prev, { role: 'assistant', text: delta, streaming: true }];
            });
          }
          break;
        }

        case 'response.output_audio_transcript.done': {
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.streaming) {
              return [
                ...prev.slice(0, -1),
                { role: 'assistant', text: event.transcript || last.text },
              ];
            }
            return prev;
          });
          break;
        }

        case 'response.output_item.added': {
          if (event.item?.type === 'function_call' && event.item?.name) {
            setIsToolCalling(true);
            setToolCallInfo(event.item.name);
            setTranscript((prev) => prev.filter((m) => m.role === 'user'));
            if (!bargeInRef.current) setMicTracksEnabled(false);
            activeFnCallRef.current = {
              call_id: event.item.call_id,
              name: event.item.name,
              arguments: '',
            };
          }
          break;
        }

        case 'response.function_call_arguments.delta': {
          if (activeFnCallRef.current && event.delta) {
            activeFnCallRef.current.arguments += event.delta;
          }
          setIsToolCalling(true);
          break;
        }

        case 'response.function_call_arguments.done': {
          const fnCall = activeFnCallRef.current;
          if (fnCall) {
            let fnArgs = {};
            try {
              fnArgs = JSON.parse(event.arguments || fnCall.arguments || '{}');
            } catch (_) {}
            executeFunctionCall(fnCall.call_id, fnCall.name, fnArgs);
            activeFnCallRef.current = null;
          }
          break;
        }

        case 'response.output_item.done': {
          break;
        }

        case 'response.done': {
          responseActiveRef.current = false;
          if (activeFnCallRef.current) break;

          setIsTrailieSpeaking(false);
          setIsToolCalling(false);
          setToolCallInfo(null);
          levelSourceRef.current = 'mic';
          bumpIdleTimer();

          if (micCooldownRef.current) clearTimeout(micCooldownRef.current);
          micCooldownRef.current = setTimeout(() => {
            if (!bargeInRef.current) setMicTracksEnabled(true);
            else if (!userMutedRef.current) setMicTracksEnabled(true);
            micCooldownRef.current = null;
            setStatus('connected');
          }, bargeInRef.current ? 200 : MIC_COOLDOWN_MS);
          break;
        }

        case 'error': {
          const msg = event.error?.message || '';
          if (msg.includes('active response') || msg.includes('already has') || msg.includes('cancelled')) {
            console.warn('[Voice] Non-fatal:', msg);
            break;
          }
          console.error('[Voice] API error:', event.error);
          setError(msg || 'An error occurred');
          break;
        }

        default:
          break;
      }
    } catch (_) {
      // ignore non-JSON
    }
  };

  const micActive =
    status !== 'idle' &&
    status !== 'error' &&
    status !== 'connecting' &&
    !userMuted &&
    Boolean(streamRef.current);

  return {
    status,
    transcript,
    isTrailieSpeaking,
    isToolCalling,
    toolCallInfo,
    error,
    authRequired,
    permissionDenied,
    userMuted,
    bargeInEnabled,
    audioLevel,
    micActive,
    connect,
    disconnect,
    setMuted,
    toggleMute,
  };
}
