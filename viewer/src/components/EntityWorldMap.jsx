import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const TYPE_COLORS = {
  GPE: '#3B82F6', // bleu
  LOC: '#10B981', // vert
}

const DEFAULT_COLOR = '#6B7280'

function markerRadius(count) {
  return Math.max(5, Math.min(28, Math.log2(count + 1) * 4.5))
}

export default function EntityWorldMap({ entities, onEntityClick }) {
  const [coords, setCoords] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!entities || entities.length === 0) {
      setLoading(false)
      return
    }

    const names = entities.map((e) => e.name)

    fetch('/api/entities/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(names),
    })
      .then((r) => r.json())
      .then((data) => {
        setCoords(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [entities])

  const markers = entities
    .filter((e) => coords[e.name] != null)
    .map((e) => ({ ...e, ...coords[e.name] }))

  return (
    <div className="relative w-full" style={{ height: '520px' }}>
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-gray-900/70 rounded-lg">
          <span className="text-white text-sm">Géocodage en cours…</span>
        </div>
      )}

      <MapContainer
        center={[20, 10]}
        zoom={2}
        minZoom={1}
        maxZoom={10}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%', borderRadius: '0.5rem' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map((m) => (
          <CircleMarker
            key={`${m.type}-${m.name}`}
            center={[m.lat, m.lon]}
            radius={markerRadius(m.count)}
            pathOptions={{
              color: TYPE_COLORS[m.type] ?? DEFAULT_COLOR,
              fillColor: TYPE_COLORS[m.type] ?? DEFAULT_COLOR,
              fillOpacity: 0.7,
              weight: 1.5,
            }}
            eventHandlers={{
              click: () => onEntityClick(m.type, m.name),
            }}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
              <span className="font-medium">{m.name}</span>
              <br />
              <span className="text-xs text-gray-500">
                {m.type} · {m.count} mention{m.count > 1 ? 's' : ''}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Légende */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-gray-900/80 text-white text-xs rounded-lg px-3 py-2 flex gap-4 pointer-events-none">
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: TYPE_COLORS.GPE }}
          />
          GPE (lieu géopolitique)
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: TYPE_COLORS.LOC }}
          />
          LOC (lieu géographique)
        </span>
        {markers.length === 0 && !loading && (
          <span className="text-gray-400">Aucune entité géolocalisée</span>
        )}
      </div>
    </div>
  )
}
