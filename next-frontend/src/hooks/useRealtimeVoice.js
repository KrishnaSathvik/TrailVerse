'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://trailverse.onrender.com/api'
    : 'http://localhost:5001/api');

const REALTIME_API_URL = 'https://api.openai.com/v1/realtime/calls';

// Cache geolocation at module level — only request once per page session
let cachedLocation = null;
let locationRequested = false;

async function getCachedLocation() {
  if (cachedLocation) return cachedLocation;
  if (locationRequested) return null; // already tried and failed
  if (!navigator.geolocation) return null;

  locationRequested = true;
  try {
    cachedLocation = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 2000);
      navigator.geolocation.getCurrentPosition(
        (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        () => { clearTimeout(timer); resolve(null); },
        { timeout: 2000, maximumAge: 600000 } // cache for 10 minutes
      );
    });
    return cachedLocation;
  } catch (_) {
    return null;
  }
}

/**
 * Hook states: idle → connecting → connected → speaking → listening → error
 */
export default function useRealtimeVoice() {
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | speaking | listening | error
  const [transcript, setTranscript] = useState([]); // [{ role: 'user'|'assistant', text }]
  const [isTrailieSpeaking, setIsTrailieSpeaking] = useState(false);
  const [isToolCalling, setIsToolCalling] = useState(false);
  const [toolCallInfo, setToolCallInfo] = useState(null); // tool name string or null
  const [error, setError] = useState(null);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const handlerRef = useRef(null);
  const connectGenRef = useRef(0); // generation counter to cancel stale async connects

  // Track in-flight function calls: { call_id, name, arguments }
  const activeFnCallRef = useRef(null);
  // Cooldown timer — prevents mic from picking up residual audio after Trailie stops
  const micCooldownRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  function cleanup() {
    if (dcRef.current) {
      try { dcRef.current.close(); } catch (_) {}
      dcRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch (_) {}
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      if (audioRef.current.parentNode) audioRef.current.parentNode.removeChild(audioRef.current);
      audioRef.current = null;
    }
    activeFnCallRef.current = null;
    if (micCooldownRef.current) {
      clearTimeout(micCooldownRef.current);
      micCooldownRef.current = null;
    }
  }

  // Execute a function call against our Express backend and send the result back
  async function executeFunctionCall(callId, fnName, fnArgs) {
    try {
      const res = await fetch(`${API_URL}/ai/voice-tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: fnName, args: fnArgs }),
      });

      const data = await res.json();
      const output = data.result || data.error || 'No data returned';

      // Send function result back through data channel
      const dc = dcRef.current;
      if (dc && dc.readyState === 'open') {
        // 1. Create the function_call_output item
        dc.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: typeof output === 'string' ? output : JSON.stringify(output),
          },
        }));

        // 2. Trigger the model to respond with the data
        dc.send(JSON.stringify({ type: 'response.create' }));
      }
    } catch (err) {
      console.error('[Voice] Function call execution failed:', err.message);
      // Send error result so the model can respond gracefully
      const dc = dcRef.current;
      if (dc && dc.readyState === 'open') {
        dc.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: `Error fetching data: ${err.message}`,
          },
        }));
        dc.send(JSON.stringify({ type: 'response.create' }));
      }
    }
  }

  const connect = useCallback(async (parkCode = null) => {
    // Bump generation — any in-flight connect with an older gen will bail out
    const gen = ++connectGenRef.current;
    const stale = () => connectGenRef.current !== gen;

    try {
      setStatus('connecting');
      setError(null);
      setTranscript([]);
      setIsTrailieSpeaking(false);
      setIsToolCalling(false);
      setToolCallInfo(null);

      // Get user's location (cached — only prompts once per page session)
      const userLocation = await getCachedLocation();
      if (stale()) return;

      // 1. Get ephemeral token from our backend
      const body = {};
      if (parkCode) body.parkCode = parkCode;
      if (userLocation?.lat && userLocation?.lng) {
        body.lat = userLocation.lat;
        body.lng = userLocation.lng;
      }
      const res = await fetch(`${API_URL}/ai/realtime-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (stale()) return;

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to create session (${res.status})`);
      }

      const sessionData = await res.json();
      const ephemeralKey = sessionData.value;

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 3. Set up audio playback for Trailie's responses
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.setAttribute('playsinline', '');
      // Route to system default output (BT speaker support)
      if (typeof audioEl.setSinkId === 'function') {
        try { await audioEl.setSinkId('default'); } catch (_) {}
      }
      audioRef.current = audioEl;

      // Append to DOM — some browsers/BT devices won't play detached audio elements
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);

      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
        // Force play for BT devices that may block autoplay
        audioEl.play().catch(() => {});
      };

      // 4. Get microphone access and add track (with echo cancellation)
      // Use device's default mic — don't lock to a specific device (BT compatibility)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Don't specify deviceId — let browser pick the best available mic
        },
      });
      if (stale()) { stream.getTracks().forEach(t => t.stop()); pc.close(); return; }
      streamRef.current = stream;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // 5. Create data channel for events (transcript, tool calls, etc.)
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        if (!stale()) setStatus('connected');
      };

      dc.onmessage = (e) => {
        if (handlerRef.current) handlerRef.current(e.data);
      };

      // 6. SDP exchange — create offer and send to OpenAI
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (stale()) { pc.close(); stream.getTracks().forEach(t => t.stop()); return; }

      const sdpRes = await fetch(REALTIME_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });
      if (stale()) { pc.close(); stream.getTracks().forEach(t => t.stop()); return; }

      if (!sdpRes.ok) {
        throw new Error(`WebRTC SDP exchange failed (${sdpRes.status})`);
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      // Monitor connection state
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
      setError(err.message);
      cleanup();
    }
  }, []);

  const disconnect = useCallback(() => {
    connectGenRef.current++; // cancel any in-flight connect
    cleanup();
    setStatus('idle');
    setIsTrailieSpeaking(false);
    setIsToolCalling(false);
    setToolCallInfo(null);
  }, []);

  // Keep handler ref always pointing to latest version (avoids stale closures)
  handlerRef.current = function handleDataChannelMessage(raw) {
    try {
      const event = JSON.parse(raw);

      switch (event.type) {
        // ── User speech ──
        case 'input_audio_buffer.speech_started': {
          // Ignore during mic mute (Trailie speaking) or cooldown (just finished speaking)
          if (streamRef.current?.getAudioTracks()[0]?.enabled === false) break;
          if (micCooldownRef.current) break;
          setStatus('listening');
          break;
        }

        case 'input_audio_buffer.speech_stopped': {
          // Only update status if mic is live (ignore stale events during mute/cooldown)
          if (streamRef.current?.getAudioTracks()[0]?.enabled !== false && !micCooldownRef.current) {
            setStatus('connected');
          }
          break;
        }

        // Audio buffer committed — VAD detected end of speech turn
        // With create_response: false, we must manually trigger the response
        case 'input_audio_buffer.committed': {
          // Only create response if mic is live and not in cooldown
          const micEnabled = streamRef.current?.getAudioTracks()[0]?.enabled !== false;
          if (micEnabled && !micCooldownRef.current) {
            const dc = dcRef.current;
            if (dc && dc.readyState === 'open') {
              dc.send(JSON.stringify({ type: 'response.create' }));
            }
          }
          break;
        }

        // User transcript finalized
        case 'conversation.item.done': {
          if (event.item?.role === 'user') {
            const parts = event.item.content || [];
            const text = parts
              .filter(p => p.transcript)
              .map(p => p.transcript.trim())
              .join(' ');
            if (text) {
              setTranscript(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'user') {
                  return [
                    ...prev.slice(0, -1),
                    { role: 'user', text: last.text + ' ' + text },
                  ];
                }
                return [...prev, { role: 'user', text }];
              });
            }
          }
          break;
        }

        // ── Trailie speaking ──
        case 'output_audio_buffer.started': {
          setIsTrailieSpeaking(true);
          // Audio starting after a tool call → tool phase is over
          setIsToolCalling(false);
          setToolCallInfo(null);
          setStatus('speaking');
          // Mute mic to prevent echo from triggering VAD self-interruption
          if (streamRef.current) {
            streamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
          }
          break;
        }

        case 'output_audio_buffer.stopped':
        case 'response.output_audio.done': {
          setIsTrailieSpeaking(false);
          setStatus('connected');
          // Re-enable mic after a cooldown to avoid residual audio triggering VAD
          if (micCooldownRef.current) clearTimeout(micCooldownRef.current);
          micCooldownRef.current = setTimeout(() => {
            if (streamRef.current) {
              streamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
            }
            micCooldownRef.current = null;
          }, 1200);
          break;
        }

        // Trailie's text transcript (streamed deltas)
        case 'response.output_audio_transcript.delta': {
          const delta = event.delta;
          if (delta) {
            setTranscript(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant' && last.streaming) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, text: last.text + delta },
                ];
              }
              return [...prev, { role: 'assistant', text: delta, streaming: true }];
            });
          }
          break;
        }

        // Trailie's transcript finalized
        case 'response.output_audio_transcript.done': {
          setTranscript(prev => {
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

        // ── Function call lifecycle ──
        case 'response.output_item.added': {
          if (event.item?.type === 'function_call' && event.item?.name) {
            setIsToolCalling(true);
            setToolCallInfo(event.item.name);
            // Clear any filler transcript so only the post-tool answer shows
            setTranscript(prev => prev.filter(m => m.role === 'user'));
            // Mute mic during tool call — prevents noise from queuing phantom responses
            if (streamRef.current) {
              streamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
            }
            // Start tracking this function call
            activeFnCallRef.current = {
              call_id: event.item.call_id,
              name: event.item.name,
              arguments: '',
            };
          }
          break;
        }

        // Function call arguments streaming
        case 'response.function_call_arguments.delta': {
          if (activeFnCallRef.current && event.delta) {
            activeFnCallRef.current.arguments += event.delta;
          }
          setIsToolCalling(true);
          break;
        }

        // Function call arguments complete — execute the function
        case 'response.function_call_arguments.done': {
          const fnCall = activeFnCallRef.current;
          if (fnCall) {
            let fnArgs = {};
            try {
              fnArgs = JSON.parse(event.arguments || fnCall.arguments || '{}');
            } catch (_) {}
            // Execute async — don't await in the handler
            executeFunctionCall(fnCall.call_id, fnCall.name, fnArgs);
            activeFnCallRef.current = null;
          }
          break;
        }

        // Tool result returned — keep isToolCalling=true, audio will clear it
        case 'response.output_item.done': {
          // Don't clear isToolCalling here — let output_audio_buffer.started do it
          break;
        }

        // Response complete — fallback clear
        case 'response.done': {
          // Only clear if no active function call (function calls trigger a new response)
          if (!activeFnCallRef.current) {
            setIsTrailieSpeaking(false);
            setStatus('connected');
          }
          break;
        }

        // Error from API
        case 'error': {
          console.error('[Voice] API error:', event.error);
          setError(event.error?.message || 'An error occurred');
          break;
        }

        default:
          break;
      }
    } catch (err) {
      // Non-JSON messages or parse errors — ignore
    }
  };

  return {
    status,
    transcript,
    isTrailieSpeaking,
    isToolCalling,
    toolCallInfo,
    error,
    connect,
    disconnect,
  };
}
