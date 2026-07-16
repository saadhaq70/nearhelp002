"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface Props {
    seekerPos: { lat: number; lng: number } | null;
    responderPos: { lat: number; lng: number } | null;
    sosType?: string;
    responderName?: string;
}

function BoundsUpdater({ seekerPos, responderPos }: { seekerPos: any; responderPos: any }) {
    const map = useMap();
    useEffect(() => {
        const points: [number, number][] = [];
        
        // Validate seeker position
        if (seekerPos?.lat && seekerPos?.lng) {
            const lat = typeof seekerPos.lat === 'number' ? seekerPos.lat : parseFloat(String(seekerPos.lat));
            const lng = typeof seekerPos.lng === 'number' ? seekerPos.lng : parseFloat(String(seekerPos.lng));
            if (!isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng)) {
                points.push([lat, lng]);
            }
        }
        
        // Validate responder position
        if (responderPos?.lat && responderPos?.lng) {
            const lat = typeof responderPos.lat === 'number' ? responderPos.lat : parseFloat(String(responderPos.lat));
            const lng = typeof responderPos.lng === 'number' ? responderPos.lng : parseFloat(String(responderPos.lng));
            if (!isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng)) {
                points.push([lat, lng]);
            }
        }
        
        if (points.length >= 2) {
            map.fitBounds(points, { padding: [60, 60] });
        } else if (points.length === 1) {
            map.setView(points[0], 15);
        }
    }, [seekerPos, responderPos, map]);
    return null;
}

export default function MutualMap({ seekerPos, responderPos, sosType, responderName }: Props) {
    // Parse coordinates to ensure they are numbers
    const parseSeekerPos = seekerPos ? {
        lat: typeof seekerPos.lat === 'number' ? seekerPos.lat : parseFloat(String(seekerPos.lat)),
        lng: typeof seekerPos.lng === 'number' ? seekerPos.lng : parseFloat(String(seekerPos.lng))
    } : null;
    
    const parseResponderPos = responderPos ? {
        lat: typeof responderPos.lat === 'number' ? responderPos.lat : parseFloat(String(responderPos.lat)),
        lng: typeof responderPos.lng === 'number' ? responderPos.lng : parseFloat(String(responderPos.lng))
    } : null;
    
    // Validate coordinates are valid numbers
    const validSeekerPos = parseSeekerPos && 
        !isNaN(parseSeekerPos.lat) && 
        !isNaN(parseSeekerPos.lng) && 
        isFinite(parseSeekerPos.lat) && 
        isFinite(parseSeekerPos.lng) ? parseSeekerPos : null;
        
    const validResponderPos = parseResponderPos && 
        !isNaN(parseResponderPos.lat) && 
        !isNaN(parseResponderPos.lng) && 
        isFinite(parseResponderPos.lat) && 
        isFinite(parseResponderPos.lng) ? parseResponderPos : null;

    const midLat = validSeekerPos && validResponderPos
        ? (validSeekerPos.lat + validResponderPos.lat) / 2
        : validSeekerPos?.lat || validResponderPos?.lat || 28.6139;

    const midLng = validSeekerPos && validResponderPos
        ? (validSeekerPos.lng + validResponderPos.lng) / 2
        : validSeekerPos?.lng || validResponderPos?.lng || 77.2090;

    const defaultCenter: [number, number] = [midLat, midLng];

    const seekerPosArr: [number, number] | null = validSeekerPos ? [validSeekerPos.lat, validSeekerPos.lng] : null;
    const responderPosArr: [number, number] | null = validResponderPos ? [validResponderPos.lat, validResponderPos.lng] : null;

    return (
        <MapContainer
            center={defaultCenter}
            zoom={14}
            className="h-full w-full z-0"
            scrollWheelZoom={false}
        >
            <BoundsUpdater seekerPos={seekerPos} responderPos={responderPos} />
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Seeker — pulsing red */}
            {seekerPosArr && (
                <CircleMarker
                    center={seekerPosArr}
                    pathOptions={{ color: "#FF3B30", fillColor: "#FF3B30", fillOpacity: 0.9, weight: 3 }}
                    radius={12}
                >
                    <Popup>
                        <div className="font-bold text-red-600 text-sm">Help Seeker</div>
                        {sosType && <div className="text-xs text-gray-600">{sosType} Emergency</div>}
                    </Popup>
                </CircleMarker>
            )}

            {/* Responder — solid black */}
            {responderPosArr && (
                <CircleMarker
                    center={responderPosArr}
                    pathOptions={{ color: "#161618", fillColor: "#161618", fillOpacity: 0.9, weight: 3 }}
                    radius={10}
                >
                    <Popup>
                        <div className="font-bold text-gray-900 text-sm">Responder</div>
                        {responderName && <div className="text-xs text-gray-600">{responderName}</div>}
                    </Popup>
                </CircleMarker>
            )}

            {/* Dashed polyline connecting them */}
            {seekerPosArr && responderPosArr && (
                <Polyline
                    positions={[seekerPosArr, responderPosArr]}
                    pathOptions={{ color: "#161618", weight: 2, dashArray: "8 6", opacity: 0.6 }}
                />
            )}
        </MapContainer>
    );
}
