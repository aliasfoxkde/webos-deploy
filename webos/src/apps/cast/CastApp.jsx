import React, { useCallback, useEffect, useRef, useState } from 'react';
import { addSource, removeSource, toggleSource, paintOrder, stopAll, nextSourceId } from './scene.js';
import './cast.css';

// CastCraft — OBS-style scene compositor. Sources (screen/window/tab via
// getDisplayMedia, camera/mic via getUserMedia) paint onto a preview canvas
// in z-order. MediaRecorder captures the composite locally. Every track is
// stopped on unmount and on explicit remove — no leaked streams.
export default function CastApp() {
  const [sources, setSources] = useState([]);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [recUrl, setRecUrl] = useState('');
  const canvasRef = useRef(null);
  const videosRef = useRef(new Map()); // id -> HTMLVideoElement (hidden)
  const rafRef = useRef(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Composite loop: paint visible sources in z-order each frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const loop = () => {
      ctx.fillStyle = '#0a0f18';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const s of paintOrder(sources)) {
        const v = videosRef.current.get(s.id);
        if (!v || !v.videoWidth) continue;
        // contain-fit the source into the canvas.
        const scale = Math.min(canvas.width / v.videoWidth, canvas.height / v.videoHeight);
        const w = v.videoWidth * scale;
        const h = v.videoHeight * scale;
        ctx.drawImage(v, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sources]);

  // Full teardown on unmount: tracks, recorder, object URLs.
  useEffect(() => () => {
    stopAll([...sources]);
    recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop();
    if (recUrl) URL.revokeObjectURL(recUrl);
  }, [sources, recUrl]);

  const attach = (id, stream) => {
    try {
      let v = videosRef.current.get(id);
      if (!v) {
        v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        videosRef.current.set(id, v);
      }
      v.srcObject = stream;
      v.play?.()?.catch?.(() => {});
    } catch {
      // A host without a usable <video> still gets the source row; the
      // preview just stays blank rather than losing the source entirely.
    }
  };

  const acquire = useCallback(async (kind) => {
    setError('');
    try {
      const constraints = kind === 'screen'
        ? { video: { cursor: 'never' }, audio: false }
        : { video: true, audio: true };
      const stream = await navigator.mediaDevices[kind === 'screen' ? 'getDisplayMedia' : 'getUserMedia'](constraints);
      const id = nextSourceId(kind);
      const label = kind === 'screen' ? 'Screen' : 'Camera + Mic';
      attach(id, stream);
      setSources((prev) => addSource(prev, { id, label, kind, stream }));
      // Browser "Stop sharing" button ends the track — drop the source then.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setSources((prev) => {
          const src = prev.find((s) => s.id === id);
          if (src) stopAll([src]);
          return removeSource(prev, id);
        });
      });
    } catch (err) {
      if (err?.name === 'NotAllowedError') return;
      setError(err?.message || (kind === 'screen' ? 'Screen capture failed.' : 'Camera/mic access failed.'));
    }
  }, []);

  const onRemove = (id) => {
    setSources((prev) => {
      const src = prev.find((s) => s.id === id);
      if (src) stopAll([src]);
      videosRef.current.delete(id);
      return removeSource(prev, id);
    });
  };

  const startRecording = () => {
    const canvas = canvasRef.current;
    const stream = canvas.captureStream(30);
    // Mix audio from every audible source into the recording.
    const ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    for (const s of sources) {
      if (s.stream?.getAudioTracks().length) {
        ac.createMediaStreamSource(s.stream).connect(dest);
      }
    }
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecUrl(URL.createObjectURL(blob));
      ac.close();
    };
    rec.start(1000);
    recorderRef.current = rec;
    setRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="cast">
      <div className="cast-toolbar" role="toolbar" aria-label="Cast tools">
        <button type="button" className="cast-btn" onClick={() => acquire('screen')}>Add screen</button>
        <button type="button" className="cast-btn" onClick={() => acquire('camera')}>Add camera</button>
        {recording
          ? <button type="button" className="cast-btn rec on" onClick={stopRecording}>■ Stop</button>
          : (
            <button
              type="button"
              className="cast-btn rec"
              disabled={!sources.length}
              onClick={startRecording}
            >
              ● Record
            </button>
          )}
        {recUrl && <a className="cast-btn" href={recUrl} download="castcraft.webm">Download recording</a>}
      </div>
      {error && <p className="cast-error" role="alert">{error}</p>}
      <canvas ref={canvasRef} width={960} height={540} className="cast-stage" aria-label="Scene preview" />
      <div className="cast-sources" role="list" aria-label="Sources">
        {sources.map((s) => (
          <div key={s.id} className="cast-source" role="listitem">
            <span className={`cast-eye ${s.visible ? 'on' : ''}`}>
              <button
                type="button"
                aria-pressed={s.visible}
                aria-label={`${s.visible ? 'Hide' : 'Show'} ${s.label}`}
                onClick={() => setSources((prev) => toggleSource(prev, s.id))}
              >
                {s.visible ? '◉' : '○'}
              </button>
            </span>
            <span className="cast-label">{s.label}</span>
            <button type="button" className="cast-btn small" aria-label={`Remove ${s.label}`} onClick={() => onRemove(s.id)}>✕</button>
          </div>
        ))}
        {!sources.length && <p className="cast-empty">No sources — add a screen or camera.</p>}
      </div>
    </div>
  );
}
