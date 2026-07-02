"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

type ProjectPin = {
  id: string;
  name: string;
  status: string;
  address: string | null;
  taskCount: number;
  lat: number;
  lng: number;
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#2563eb",
  ON_HOLD: "#f59e0b",
  DONE: "#22c55e",
  ARCHIVED: "#9ca3af",
};

const STATUS_RO: Record<string, string> = {
  ACTIVE: "Activ",
  ON_HOLD: "În așteptare",
  DONE: "Finalizat",
  ARCHIVED: "Arhivat",
};

export default function ProjectsMapView({ pins }: { pins: ProjectPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<ProjectPin | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!token || !containerRef.current || pins.length === 0) return;

    let map: import("mapbox-gl").Map;

    import("mapbox-gl").then((mbgl) => {
      if (!containerRef.current) return;
      mbgl.default.accessToken = token;

      map = new mbgl.default.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [pins[0].lng, pins[0].lat],
        zoom: 10,
      });

      map.on("load", () => {
        if (pins.length > 1) {
          const bounds = pins.reduce(
            (b, p) => b.extend([p.lng, p.lat]),
            new mbgl.default.LngLatBounds([pins[0].lng, pins[0].lat], [pins[0].lng, pins[0].lat]),
          );
          map.fitBounds(bounds, { padding: 80, maxZoom: 14 });
        }

        pins.forEach((pin) => {
          const el = document.createElement("div");
          el.style.cssText = `
            width: 32px; height: 32px; border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg); background: ${STATUS_COLOR[pin.status] ?? "#2563eb"};
            border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,.35);
            cursor: pointer; transition: transform .15s;
          `;
          el.addEventListener("mouseenter", () => {
            el.style.transform = "rotate(-45deg) scale(1.2)";
            setHovered(pin);
          });
          el.addEventListener("mouseleave", () => {
            el.style.transform = "rotate(-45deg) scale(1)";
            setHovered(null);
          });

          new mbgl.default.Marker({ element: el })
            .setLngLat([pin.lng, pin.lat])
            .addTo(map);
        });
      });
    });

    return () => { map?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!token) {
    return (
      <div className="card grid place-items-center p-16 text-center text-sm text-ink-soft">
        <p className="mb-1 font-semibold text-ink">Hartă indisponibilă</p>
        <p>
          Variabila <code className="rounded bg-[var(--color-surface-2)] px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> nu este configurată.
        </p>
        <p className="mt-1">Adaug-o în Vercel → Settings → Environment Variables.</p>
      </div>
    );
  }

  if (pins.length === 0) {
    return (
      <div className="card grid place-items-center p-16 text-center text-sm text-ink-soft">
        <p className="mb-1 font-semibold text-ink">Niciun proiect cu locație</p>
        <p>Deschide un proiect, apasă pe câmpul Adresă și selectează locația de pe hartă.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[calc(100dvh-8rem)] w-full overflow-hidden rounded-2xl border border-[var(--color-line)]"
      />

      {/* Hover card — panel fix în dreapta sus, apare la hover pe marker */}
      {hovered && (
        <div className="pointer-events-none absolute right-4 top-14 z-10 w-64 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-xl">
          <p className="mb-1 text-sm font-bold leading-tight">{hovered.name}</p>
          <div className="mb-1 flex items-center gap-1.5 text-xs text-ink-soft">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: STATUS_COLOR[hovered.status] ?? "#9ca3af" }}
            />
            {STATUS_RO[hovered.status] ?? hovered.status}
            <span className="mx-1">·</span>
            {hovered.taskCount} task-uri
          </div>
          {hovered.address && (
            <p className="mb-3 text-xs text-ink-soft">{hovered.address}</p>
          )}
          <div className="pointer-events-auto flex gap-3">
            <a
              href={`/projects/${hovered.id}`}
              className="text-xs font-semibold text-brand hover:underline"
            >
              Detalii
            </a>
            <a
              href={`/tasks?scope=all&proj=${hovered.id}`}
              className="text-xs font-semibold text-brand hover:underline"
            >
              Task-uri →
            </a>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-lg">
        <p className="mb-2 text-xs font-semibold text-ink-soft">Legendă</p>
        <div className="flex flex-col gap-1.5">
          {Object.entries(STATUS_RO).map(([k, label]) => (
            <div key={k} className="flex items-center gap-2">
              <span
                className="size-3 rounded-full"
                style={{ background: STATUS_COLOR[k] ?? "#9ca3af" }}
              />
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Count badge */}
      <div className="absolute right-4 top-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 shadow-lg">
        <span className="text-sm font-semibold">{pins.length}</span>
        <span className="ml-1 text-xs text-ink-soft">proiecte pe hartă</span>
      </div>
    </div>
  );
}
