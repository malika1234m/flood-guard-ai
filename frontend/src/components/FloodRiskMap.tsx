import { useCallback, useEffect, useRef, useState } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "geojson";
import type { LiveDistrictRisk } from "@/lib/api";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

export const RISK_COLORS: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#eab308",
  High: "#f97316",
  Severe: "#ef4444",
};

const RISK_ORDER = ["Severe", "High", "Moderate", "Low"];

// ── Subdivision risk blending ─────────────────────────────────────────────────
// Combine district live score (60%) with geographic modifier (40%) per subdivision
function blendRisk(districtScore: number, modifier: number): number {
  return districtScore * 0.6 + modifier * 0.4;
}

function blendColor(score: number): string {
  if (score >= 0.62) return RISK_COLORS.Severe;
  if (score >= 0.48) return RISK_COLORS.High;
  if (score >= 0.34) return RISK_COLORS.Moderate;
  return RISK_COLORS.Low;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  liveRisks: LiveDistrictRisk[];
  selectedDistrict: string;
  onDistrictClick: (district: string) => void;
  loading?: boolean;
}

interface PopupState {
  district?: string;
  subdivision?: string;
  zone?: string;
  risk?: number;
  lng: number;
  lat: number;
}

interface SubdivisionProps {
  district: string;
  subdivision: string;
  centroid_lon: number;
  centroid_lat: number;
  risk_modifier: number;
  zone: string;
  evac_rank: number;
  flood_rank: number;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FloodRiskMap({
  liveRisks,
  selectedDistrict,
  onDistrictClick,
  loading = false,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const [districtGeo, setDistrictGeo] = useState<FeatureCollection | null>(null);
  const [subdivisionGeo, setSubdivisionGeo] = useState<FeatureCollection | null>(null);
  const [activeSubdivGeo, setActiveSubdivGeo] = useState<FeatureCollection | null>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const riskByDistrict: Record<string, LiveDistrictRisk> = {};
  for (const r of liveRisks) riskByDistrict[r.district] = r;

  // ── Load district polygons ──────────────────────────────────────────────────
  useEffect(() => {
    fetch("/geodata/srilanka_districts.geojson")
      .then((r) => r.json())
      .then((data: FeatureCollection) => {
        const enriched: FeatureCollection = {
          ...data,
          features: data.features.map((f: Feature) => {
            const raw = (f.properties as { district: string }).district;
            const district = raw.replace(/_/g, " ").trim();
            const risk = riskByDistrict[district];
            return {
              ...f,
              properties: {
                ...f.properties,
                district,
                risk_score: risk?.live_score ?? 0,
                risk_category: risk?.live_category ?? "Low",
                rainfall_7d: risk?.rainfall_7d_mm ?? 0,
                trend: risk?.trend ?? "Stable",
                is_selected: district === selectedDistrict ? 1 : 0,
              },
            };
          }),
        };
        setDistrictGeo(enriched);
      })
      .catch(() => {});
  }, [liveRisks, selectedDistrict]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load subdivisions GeoJSON (once) ───────────────────────────────────────
  useEffect(() => {
    fetch("/geodata/srilanka_subdivisions.geojson")
      .then((r) => r.json())
      .then((data: FeatureCollection) => setSubdivisionGeo(data))
      .catch(() => {});
  }, []);

  // ── Filter + enrich subdivisions for selected district ─────────────────────
  useEffect(() => {
    if (!subdivisionGeo || !selectedDistrict) return;
    const distRisk = riskByDistrict[selectedDistrict]?.live_score ?? 0.4;

    const features = subdivisionGeo.features
      .filter(
        (f: Feature) =>
          (f.properties as SubdivisionProps).district === selectedDistrict,
      )
      .map((f: Feature) => {
        const p = f.properties as SubdivisionProps;
        const blended = blendRisk(distRisk, p.risk_modifier);
        return {
          ...f,
          properties: {
            ...p,
            blended_risk: blended,
            blend_color: blendColor(blended),
          },
        };
      });

    setActiveSubdivGeo({ type: "FeatureCollection", features });
  }, [subdivisionGeo, selectedDistrict, liveRisks]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fly to selected district ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !districtGeo || !selectedDistrict) return;
    const feature = districtGeo.features.find(
      (f) => (f.properties as { district: string }).district === selectedDistrict,
    );
    if (!feature) return;
    const { centroid_lon, centroid_lat } = feature.properties as {
      centroid_lon: number;
      centroid_lat: number;
    };
    mapRef.current.flyTo({
      center: [centroid_lon, centroid_lat],
      zoom: 9.2,
      duration: 1100,
    });
  }, [selectedDistrict, districtGeo]);

  // ── Map interaction ─────────────────────────────────────────────────────────
  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!mapRef.current) return;
      // Check subdivision layer first (higher priority)
      const subdivFeatures = mapRef.current.queryRenderedFeatures(e.point, {
        layers: ["subdiv-fill"],
      });
      if (subdivFeatures.length > 0) {
        // Don't change district, just show popup
        setPopup(null);
        return;
      }
      const distFeatures = mapRef.current.queryRenderedFeatures(e.point, {
        layers: ["district-fill"],
      });
      if (distFeatures.length > 0) {
        const d = (distFeatures[0].properties as { district: string }).district;
        onDistrictClick(d);
        setPopup(null);
      }
    },
    [onDistrictClick],
  );

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    if (!mapRef.current) return;

    // Subdivision hover
    const subdivF = mapRef.current.queryRenderedFeatures(e.point, {
      layers: ["subdiv-fill"],
    });
    if (subdivF.length > 0) {
      mapRef.current.getCanvas().style.cursor = "pointer";
      const p = subdivF[0].properties as SubdivisionProps & {
        blended_risk: number;
      };
      setPopup({
        subdivision: p.subdivision,
        zone: p.zone,
        risk: p.blended_risk,
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      });
      return;
    }

    // District hover
    const distF = mapRef.current.queryRenderedFeatures(e.point, {
      layers: ["district-fill"],
    });
    if (distF.length > 0) {
      mapRef.current.getCanvas().style.cursor = "pointer";
      setPopup({
        district: (distF[0].properties as { district: string }).district,
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      });
    } else {
      mapRef.current.getCanvas().style.cursor = "";
      setPopup(null);
    }
  }, []);

  const fillColor = [
    "match",
    ["get", "risk_category"],
    "Severe", RISK_COLORS.Severe,
    "High", RISK_COLORS.High,
    "Moderate", RISK_COLORS.Moderate,
    RISK_COLORS.Low,
  ] as const;

  // Special zone markers derived from activeSubdivGeo
  const floodMarkers = activeSubdivGeo?.features.filter(
    (f) => (f.properties as SubdivisionProps).flood_rank > 0,
  ) ?? [];
  const evacMarkers = activeSubdivGeo?.features.filter(
    (f) => (f.properties as SubdivisionProps).evac_rank > 0,
  ) ?? [];

  return (
    <div className="relative w-full overflow-hidden rounded-[18px]" style={{ height: 500 }}>
      {/* Legend */}
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5 rounded-xl border border-white/10 bg-[#070e1a]/92 px-3 py-2.5 backdrop-blur-md">
        <div className="mb-0.5 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-white/35">
          District Risk
        </div>
        {RISK_ORDER.map((cat) => {
          const count = liveRisks.filter((r) => r.live_category === cat).length;
          return (
            <div key={cat} className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: RISK_COLORS[cat] }} />
              <span className="text-[0.7rem] font-bold" style={{ color: RISK_COLORS[cat] }}>
                {cat}
              </span>
              {count > 0 && <span className="text-[0.65rem] text-white/35">{count}</span>}
            </div>
          );
        })}
        {selectedDistrict && (
          <>
            <div className="my-1 h-px bg-white/10" />
            <div className="mb-0.5 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-white/35">
              Within district
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base">🔴</span>
              <span className="text-[0.7rem] font-bold text-red-400">Flood Zone</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base">🟢</span>
              <span className="text-[0.7rem] font-bold text-green-400">Safe / Evacuate</span>
            </div>
          </>
        )}
      </div>

      {/* Live badge */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#070e1a]/92 px-3 py-1.5 backdrop-blur-md">
        <span className="pulse-dot" />
        <span className="text-[0.65rem] font-bold text-brand">LIVE · OPEN-METEO</span>
      </div>

      {/* Click-back hint when drill-down active */}
      {selectedDistrict && activeSubdivGeo && (
        <div className="absolute bottom-10 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-[#070e1a]/90 px-4 py-1.5 backdrop-blur-md">
          <span className="text-[0.7rem] font-semibold text-white/60">
            Showing subdivisions of <span className="text-brand font-bold">{selectedDistrict}</span> — click another district to switch
          </span>
        </div>
      )}

      {/* Loading overlay */}
      {(loading || !districtGeo) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[18px] bg-[#070e1a]/70 backdrop-blur-sm">
          <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-[#070e1a]/90 px-5 py-2.5">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
            <span className="text-sm font-semibold text-white/70">Loading Sri Lanka risk map…</span>
          </div>
        </div>
      )}

      <Map
        ref={mapRef}
        initialViewState={{ longitude: 80.77, latitude: 7.87, zoom: 6.8 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLE}
        onLoad={() => setMapLoaded(true)}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setPopup(null)}
        attributionControl={false}
      >
        <NavigationControl position="bottom-right" showCompass={false} />

        {/* ── District layer ── */}
        {districtGeo && mapLoaded && (
          <Source id="districts" type="geojson" data={districtGeo}>
            <Layer
              id="district-fill"
              type="fill"
              paint={{
                "fill-color": fillColor as unknown as maplibregl.ExpressionSpecification,
                "fill-opacity": [
                  "case",
                  ["==", ["get", "is_selected"], 1], 0.20,
                  0.28,
                ],
              }}
            />
            <Layer
              id="district-outline"
              type="line"
              paint={{
                "line-color": [
                  "case",
                  ["==", ["get", "is_selected"], 1], "rgba(255,255,255,0.6)",
                  "rgba(255,255,255,0.25)",
                ],
                "line-width": [
                  "case",
                  ["==", ["get", "is_selected"], 1], 2,
                  0.7,
                ],
              }}
            />
            {/* District labels — hide selected (subdivisions take over) */}
            <Layer
              id="district-labels"
              type="symbol"
              filter={["!=", ["get", "is_selected"], 1]}
              layout={
                {
                  "text-field": ["get", "district"],
                  "text-size": 9,
                  "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
                  "text-anchor": "center",
                  "text-allow-overlap": false,
                  "text-max-width": 7,
                } as maplibregl.SymbolLayerSpecification["layout"]
              }
              paint={{
                "text-color": "#ffffff",
                "text-halo-color": "rgba(0,0,0,0.85)",
                "text-halo-width": 1.5,
                "text-opacity": 0.85,
              }}
            />
          </Source>
        )}

        {/* ── Subdivision layer (drill-down for selected district) ── */}
        {activeSubdivGeo && mapLoaded && (
          <Source id="subdivisions" type="geojson" data={activeSubdivGeo}>
            {/* Zone fill */}
            <Layer
              id="subdiv-fill"
              type="fill"
              paint={{
                "fill-color": [
                  "match",
                  ["get", "zone"],
                  "flood_zone", "#ef4444",
                  "safe_zone",  "#22c55e",
                  /* moderate → use blended color */
                  ["get", "blend_color"],
                ],
                "fill-opacity": [
                  "match",
                  ["get", "zone"],
                  "flood_zone", 0.62,
                  "safe_zone",  0.52,
                  0.40,
                ],
              }}
            />
            {/* Inner glow on flood / safe zones */}
            <Layer
              id="subdiv-fill-glow"
              type="fill"
              filter={["in", ["get", "zone"], ["literal", ["flood_zone", "safe_zone"]]]}
              paint={{
                "fill-color": [
                  "match",
                  ["get", "zone"],
                  "flood_zone", "#ff1a1a",
                  "#00ff88",
                ],
                "fill-opacity": 0.15,
              }}
            />
            {/* Borders */}
            <Layer
              id="subdiv-outline"
              type="line"
              paint={{
                "line-color": [
                  "match",
                  ["get", "zone"],
                  "flood_zone", "#ef4444",
                  "safe_zone",  "#22c55e",
                  "rgba(255,255,255,0.35)",
                ],
                "line-width": [
                  "match",
                  ["get", "zone"],
                  "flood_zone", 1.8,
                  "safe_zone",  1.8,
                  0.7,
                ],
              }}
            />
            {/* Subdivision name labels */}
            <Layer
              id="subdiv-labels"
              type="symbol"
              layout={
                {
                  "text-field": ["get", "subdivision"],
                  "text-size": 9.5,
                  "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
                  "text-anchor": "center",
                  "text-allow-overlap": false,
                  "text-max-width": 8,
                } as maplibregl.SymbolLayerSpecification["layout"]
              }
              paint={{
                "text-color": [
                  "match",
                  ["get", "zone"],
                  "flood_zone", "#ffcdd2",
                  "safe_zone",  "#bbf7d0",
                  "#e2e8f0",
                ],
                "text-halo-color": "rgba(0,0,0,0.9)",
                "text-halo-width": 1.5,
              }}
            />
          </Source>
        )}

        {/* ── Flood zone markers ── */}
        {floodMarkers.map((f) => {
          const p = f.properties as SubdivisionProps;
          return (
            <Marker
              key={`flood-${p.subdivision}`}
              longitude={p.centroid_lon}
              latitude={p.centroid_lat}
              anchor="center"
            >
              <div
                title={`⚠ Flood Hotspot: ${p.subdivision}`}
                className="flex h-9 w-9 flex-col items-center justify-center rounded-full border-2 border-red-500 bg-red-500/20 shadow-lg backdrop-blur-sm"
                style={{ boxShadow: "0 0 16px rgba(239,68,68,0.7), 0 0 32px rgba(239,68,68,0.3)" }}
              >
                <span className="text-base leading-none">🌊</span>
              </div>
            </Marker>
          );
        })}

        {/* ── Evacuation zone markers ── */}
        {evacMarkers.map((f) => {
          const p = f.properties as SubdivisionProps;
          return (
            <Marker
              key={`evac-${p.subdivision}`}
              longitude={p.centroid_lon}
              latitude={p.centroid_lat}
              anchor="center"
            >
              <div
                title={`✓ Safe Evacuation Zone: ${p.subdivision}`}
                className="flex h-9 w-9 flex-col items-center justify-center rounded-full border-2 border-green-500 bg-green-500/20 shadow-lg backdrop-blur-sm"
                style={{ boxShadow: "0 0 16px rgba(34,197,94,0.7), 0 0 32px rgba(34,197,94,0.3)" }}
              >
                <span className="text-base leading-none">🛡</span>
              </div>
            </Marker>
          );
        })}

        {/* ── Hover popup ── */}
        {popup && (
          <Popup
            longitude={popup.lng}
            latitude={popup.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={14}
          >
            {popup.subdivision ? (
              /* Subdivision popup */
              (() => {
                const zone = popup.zone ?? "moderate";
                const c =
                  zone === "flood_zone"
                    ? "#ef4444"
                    : zone === "safe_zone"
                      ? "#22c55e"
                      : "#f97316";
                const label =
                  zone === "flood_zone"
                    ? "🌊 FLOOD ZONE"
                    : zone === "safe_zone"
                      ? "🛡 SAFE · EVACUATE HERE"
                      : "⚠ MODERATE RISK";
                return (
                  <div
                    style={{
                      background: "#0a1628",
                      border: `1px solid ${c}50`,
                      borderRadius: 12,
                      padding: "10px 14px",
                      minWidth: 170,
                      boxShadow: `0 8px 32px rgba(0,0,0,0.65), 0 0 0 1px ${c}20`,
                    }}
                  >
                    <div style={{ color: c, fontWeight: 800, fontSize: 11, marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ color: "#e6edf6", fontWeight: 700, fontSize: 13, marginBottom: 5 }}>
                      {popup.subdivision}
                    </div>
                    {popup.risk !== undefined && (
                      <div style={{ color: c, fontWeight: 800, fontSize: 17 }}>
                        {Math.round(popup.risk * 100)}% flood risk
                      </div>
                    )}
                    {zone === "safe_zone" && (
                      <div style={{ color: "#4ade80", fontSize: 11, marginTop: 5 }}>
                        Recommended evacuation area
                      </div>
                    )}
                    {zone === "flood_zone" && (
                      <div style={{ color: "#fca5a5", fontSize: 11, marginTop: 5 }}>
                        High likelihood of inundation
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              /* District popup */
              (() => {
                const risk = popup.district ? riskByDistrict[popup.district] : null;
                if (!risk) return null;
                const c = RISK_COLORS[risk.live_category] ?? "#38bdf8";
                return (
                  <div
                    style={{
                      background: "#0a1628",
                      border: `1px solid ${c}40`,
                      borderRadius: 12,
                      padding: "10px 14px",
                      minWidth: 158,
                      boxShadow: `0 8px 32px rgba(0,0,0,0.6)`,
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 13, color: "#e6edf6", marginBottom: 5 }}>
                      {risk.district}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                      <span
                        style={{
                          background: `${c}20`,
                          borderRadius: 999,
                          padding: "2px 10px",
                          color: c,
                          fontWeight: 700,
                          fontSize: 11,
                        }}
                      >
                        {risk.live_category} Risk
                      </span>
                      <span style={{ color: c, fontWeight: 800, fontSize: 18 }}>
                        {Math.round(risk.live_score * 100)}%
                      </span>
                    </div>
                    <div style={{ color: "#93a4bf", fontSize: 11, marginBottom: 5 }}>
                      🌧 {risk.rainfall_7d_mm.toFixed(0)} mm ·{" "}
                      <span
                        style={{
                          color:
                            risk.trend === "Worsening"
                              ? "#ef4444"
                              : risk.trend === "Improving"
                                ? "#22c55e"
                                : "#93a4bf",
                        }}
                      >
                        {risk.trend === "Worsening" ? "↑" : risk.trend === "Improving" ? "↓" : "→"}{" "}
                        {risk.trend}
                      </span>
                    </div>
                    <div style={{ color: "#5a6a7e", fontSize: 10 }}>Click to select</div>
                  </div>
                );
              })()
            )}
          </Popup>
        )}
      </Map>
    </div>
  );
}
