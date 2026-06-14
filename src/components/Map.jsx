/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CUISINE_FR } from '../config';

const DEFAULT_CENTER = [1.87, 46.17], DEFAULT_ZOOM = 10;
const ROUTE_SRC = 'vr-route', ROUTE_OUT = 'vr-route-out', ROUTE_LN = 'vr-route-ln';
const BIS_SRC = 'vr-bis', BIS_OUT = 'vr-bis-out', BIS_LN = 'vr-bis-ln';
const FILT_SRC = 'vr-filt', FILT_LN = 'vr-filt-ln';
const ISO_SRC = 'vr-iso', ISO_FILL = 'vr-iso-fill', ISO_BRD = 'vr-iso-brd';
const SC = { ok: '#5b6b2d', warning: '#c97b32', forbidden: '#7a2e2e' };
const EFC = { type: 'FeatureCollection', features: [] };

function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }
function fmtCuisine(r) { return r?r.split(/[;,]/).map(c=>{const k=c.trim().toLowerCase();return CUISINE_FR[k]||(k.charAt(0).toUpperCase()+k.slice(1));}).join(', '):''; }
function popup(p) {
  let h = `<div style="font-family:-apple-system,sans-serif;max-width:240px;font-size:14px;"><strong style="font-size:15px;">${p.emoji} ${esc(p.name)}</strong>`;
  if (p.subtype) h += `<br><span style="color:#8b6e4e;font-size:12px;">${esc(p.subtype)}</span>`;
  else if (p.label) h += `<br><span style="color:#8b6e4e;font-size:12px;">${esc(p.label)}</span>`;
  if (p.address) h += `<br><span style="color:#666;font-size:12px;">📍 ${esc(p.address)}</span>`;
  if (p.cuisine) h += `<br><span style="color:#666;font-size:12px;">🍴 ${esc(fmtCuisine(p.cuisine))}</span>`;
  if (p.stars) h += `<br>${'⭐'.repeat(Math.min(5,parseInt(p.stars,10)||0))}`;
  if (p.openingHours) h += `<br><span style="color:#666;font-size:11px;">🕐 ${esc(p.openingHours)}</span>`;
  if (p.phone) h += `<br>📞 <a href="tel:${esc(p.phone)}" style="color:#5b6b2d;">${esc(p.phone)}</a>`;
  if (p.website) { const w = /^https?:\/\//i.test(p.website) ? p.website : 'https://' + p.website.replace(/^\/+/, ''); h += `<br>🌐 <a href="${esc(w)}" target="_blank" rel="noopener noreferrer" style="color:#5b6b2d;">Site web</a>`; }
  if (p.description) h += `<br><span style="color:#555;font-size:12px;font-style:italic;">${esc(p.description.substring(0,120))}${p.description.length>120?'…':''}</span>`;
  if (p.type==='sp98'&&p.price) { h += `<br><b style="color:#5b6b2d;">${p.price.toFixed(3)} €/L</b>`; if (p.updated) h += ` <span style="color:#999;font-size:11px;">(${p.updated})</span>`; }
  return h + '</div>';
}

const Map = forwardRef(function Map({ routeGeoJSON, filteredGeoJSON, bisRouteGeoJSON, pois, sp98Stations, isochroneGeoJSON, routeAlerts, onToggleFullscreen, isFullscreen, onPoiMarkerClick }, ref) {
  const ctr = useRef(null), mRef = useRef(null), [ready, setReady] = useState(false);
  const mk = useRef([]), pmk = useRef([]), smk = useRef([]), amk = useRef([]);

  useImperativeHandle(ref, () => ({
    fitBounds(b) { if (!mRef.current||!b) return; const bb = Array.isArray(b)?[[b[0],b[1]],[b[2],b[3]]]:[[b.west,b.south],[b.east,b.north]]; mRef.current.fitBounds(bb,{padding:60,maxZoom:15}); },
    flyTo(lon,lat) { mRef.current?.flyTo({center:[lon,lat],zoom:14}); },
    getContainer() { return ctr.current; }, resize() { mRef.current?.resize(); }, getMapInstance() { return mRef.current; },
  }));

  useEffect(() => {
    if (mRef.current) return; const c = ctr.current; if (!c) return;
    const init = () => {
      const r = c.getBoundingClientRect(); if (!r.width||!r.height) { requestAnimationFrame(init); return; }
      const map = new maplibregl.Map({ container: c, style: 'https://tiles.openfreemap.org/styles/liberty', center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, attributionControl: true, preserveDrawingBuffer: true });
      map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'top-right');
      map.addControl(new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:true,showUserHeading:true}), 'top-right');
      map.addControl(new maplibregl.ScaleControl({unit:'metric'}), 'bottom-left');
      map.on('load', () => {
        map.addSource(ISO_SRC,{type:'geojson',data:EFC});
        map.addLayer({id:ISO_FILL,type:'fill',source:ISO_SRC,paint:{'fill-color':'#5b6b2d','fill-opacity':0.12}});
        map.addLayer({id:ISO_BRD,type:'line',source:ISO_SRC,paint:{'line-color':'#5b6b2d','line-width':2,'line-dasharray':[4,3]}});
        map.addSource(BIS_SRC,{type:'geojson',data:EFC});
        map.addLayer({id:BIS_OUT,type:'line',source:BIS_SRC,paint:{'line-color':'#1e3a5b','line-width':8,'line-opacity':0.25},layout:{'line-join':'round','line-cap':'round'}});
        map.addLayer({id:BIS_LN,type:'line',source:BIS_SRC,paint:{'line-color':'#3b82f6','line-width':5,'line-opacity':0.8},layout:{'line-join':'round','line-cap':'round'}});
        map.addSource(ROUTE_SRC,{type:'geojson',data:EFC});
        map.addLayer({id:ROUTE_OUT,type:'line',source:ROUTE_SRC,paint:{'line-color':'#1e2d3a','line-width':8,'line-opacity':0.3},layout:{'line-join':'round','line-cap':'round'}});
        map.addLayer({id:ROUTE_LN,type:'line',source:ROUTE_SRC,paint:{'line-color':'#5b6b2d','line-width':5,'line-opacity':0.85},layout:{'line-join':'round','line-cap':'round'}});
        map.addSource(FILT_SRC,{type:'geojson',data:EFC});
        map.addLayer({id:FILT_LN,type:'line',source:FILT_SRC,paint:{'line-color':['match',['get','status'],'ok',SC.ok,'warning',SC.warning,'forbidden',SC.forbidden,SC.ok],'line-width':5,'line-opacity':0.9},layout:{'line-join':'round','line-cap':'round'}});
        setReady(true);
      });
      mRef.current = map;
    };
    init();
    return () => { mRef.current?.remove(); mRef.current = null; };
  }, []);

  useEffect(() => { if (mRef.current) setTimeout(() => mRef.current.resize(), 100); }, [isFullscreen]);

  // Route principale
  useEffect(() => { const m=mRef.current; if(!m||!ready) return; const s=m.getSource(ROUTE_SRC); if(!s) return;
    mk.current.forEach(x=>x.remove()); mk.current=[];
    if (!routeGeoJSON) { s.setData(EFC); return; }
    s.setData({type:'FeatureCollection',features:[routeGeoJSON]});
    const co=routeGeoJSON.geometry.coordinates;
    if (co?.length>=2) { mk.current=[new maplibregl.Marker({color:'#5b6b2d'}).setLngLat(co[0]).setPopup(new maplibregl.Popup({offset:25}).setText('Départ')).addTo(m), new maplibregl.Marker({color:'#7a2e2e'}).setLngLat(co[co.length-1]).setPopup(new maplibregl.Popup({offset:25}).setText('Arrivée')).addTo(m)]; }
  }, [routeGeoJSON, ready]);

  useEffect(() => { const m=mRef.current; if(!m||!ready) return; const s=m.getSource(BIS_SRC); if(s) s.setData(bisRouteGeoJSON?{type:'FeatureCollection',features:[bisRouteGeoJSON]}:EFC); }, [bisRouteGeoJSON, ready]);
  useEffect(() => { const m=mRef.current; if(!m||!ready) return; const s=m.getSource(FILT_SRC); if(!s) return; if(!filteredGeoJSON){s.setData(EFC);m.setPaintProperty(ROUTE_LN,'line-opacity',0.85);return;} s.setData(filteredGeoJSON); m.setPaintProperty(ROUTE_LN,'line-opacity',0); }, [filteredGeoJSON, ready]);
  useEffect(() => { const m=mRef.current; if(!m||!ready) return; const s=m.getSource(ISO_SRC); if(s) s.setData(isochroneGeoJSON?{type:'FeatureCollection',features:[isochroneGeoJSON]}:EFC); }, [isochroneGeoJSON, ready]);

  // POI markers — clic sur un marker = callback vers le parent
  useEffect(() => { const m=mRef.current; if(!m||!ready) return; pmk.current.forEach(x=>x.remove()); pmk.current=[];
    if (!pois?.length) return;
    pmk.current = pois.map(poi => {
      const el = document.createElement('div');
      el.textContent = poi.emoji; el.style.fontSize = '22px'; el.style.cursor = 'pointer';

      // Clic sur le marker → ouvrir popup ET notifier le parent
      el.addEventListener('click', () => {
        if (onPoiMarkerClick) onPoiMarkerClick(poi);
      });

      return new maplibregl.Marker({element:el}).setLngLat([poi.lon,poi.lat])
        .setPopup(new maplibregl.Popup({offset:20,maxWidth:'260px'}).setHTML(popup(poi))).addTo(m);
    });
  }, [pois, ready, onPoiMarkerClick]);

  // SP98
  useEffect(() => { const m=mRef.current; if(!m||!ready) return; smk.current.forEach(x=>x.remove()); smk.current=[];
    if (!sp98Stations?.length) return;
    smk.current = sp98Stations.map(s => { const e=document.createElement('div'); e.textContent='⛽'; e.style.fontSize='20px'; e.style.cursor='pointer';
      return new maplibregl.Marker({element:e}).setLngLat([s.lon,s.lat]).setPopup(new maplibregl.Popup({offset:20,maxWidth:'240px'}).setHTML(popup(s))).addTo(m); });
  }, [sp98Stations, ready]);

  // Bloc E : Alertes virages serrés et descentes fortes
  useEffect(() => { const m=mRef.current; if(!m||!ready) return; amk.current.forEach(x=>x.remove()); amk.current=[];
    if (!routeAlerts?.length) return;
    amk.current = routeAlerts.map(a => {
      const el = document.createElement('div');
      el.textContent = a.type === 'sharp' ? '⚠️' : '🔻';
      el.style.fontSize = '16px';
      el.style.cursor = 'pointer';
      el.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))';
      const color = a.type === 'sharp' ? '#c97b32' : '#7a2e2e';
      return new maplibregl.Marker({element:el}).setLngLat([a.lon,a.lat])
        .setPopup(new maplibregl.Popup({offset:15,maxWidth:'200px'}).setHTML(
          `<div style="font-family:-apple-system,sans-serif;font-size:13px;"><strong style="color:${color};">${a.type==='sharp'?'⚠️ Virage serré':'🔻 Forte descente'}</strong><br><span style="color:#666;font-size:12px;">${esc(a.label)}</span></div>`
        )).addTo(m);
    });
  }, [routeAlerts, ready]);

  return (
    <div ref={ctr} className="vr-map-container" style={{position:'absolute',top:0,left:0,right:0,bottom:0,width:'100%',height:'100%'}}>
      {!ready && <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',backgroundColor:'#f2edd8'}}><p style={{fontSize:'18px',color:'#5c3d2a'}}>Chargement de la carte…</p></div>}
      {onToggleFullscreen && <button type="button" onClick={onToggleFullscreen} style={{position:'absolute',top:10,left:10,zIndex:10,width:40,height:40,borderRadius:8,border:'2px solid rgba(0,0,0,0.15)',backgroundColor:'white',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.2)'}}>{isFullscreen?'✕':'⛶'}</button>}
      {bisRouteGeoJSON && <div style={{position:'absolute',bottom:40,left:10,zIndex:10,backgroundColor:'white',borderRadius:8,padding:'8px 12px',boxShadow:'0 1px 4px rgba(0,0,0,0.2)',fontSize:13}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}><span style={{display:'inline-block',width:20,height:4,backgroundColor:'#5b6b2d',borderRadius:2}}/><span>Principal</span></div>
        <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{display:'inline-block',width:20,height:4,backgroundColor:'#3b82f6',borderRadius:2}}/><span>Bis (POI)</span></div>
      </div>}
    </div>
  );
});
export default Map;
