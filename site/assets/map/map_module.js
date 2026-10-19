(() => {
  const state={catalog:[], geo:null, map:null, layers:new Map(), allLayers:[], selectedCity:'valparaiso', selectedUnit:'', selectedLine:null, selectedDirection:''};
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=s=>String(s||'').toUpperCase().replace(/[-\s]/g,'');
  const directionPalette=['#0077b6','#e76f51','#7b2cbf','#2a9d8f','#d97706'];
  const directionColor=index=>directionPalette[(Number.parseInt(index,10)||0)%directionPalette.length];
  const routeKey=(city,rid)=>`${city}:${norm(rid)}`;
  const cityName=city=>city==='osorno'?'Osorno':'Gran Valparaíso';
  const cityView={valparaiso:{center:[-33.02,-71.42],zoom:10},osorno:{center:[-40.574,-73.133],zoom:13}};

  async function init(){
    state.map=L.map('map',{preferCanvas:true}).setView(cityView.valparaiso.center,cityView.valparaiso.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);
    const [catRes,geoRes,osCatRes,osGeoRes]=await Promise.all([fetch('data/map/route_catalog.json?v=20261018-2'),fetch('data/map/routes.geojson?v=20261018-2'),fetch('data/map/osorno_catalog.json?v=20261017-2'),fetch('data/map/osorno_routes.geojson?v=20261017-2')]);
    const cat=await catRes.json(),geo=await geoRes.json(),osCat=await osCatRes.json(),osGeo=await osGeoRes.json();
    state.catalog=[...(cat.routes||[]).map(r=>({...r,city:'valparaiso'})),...(osCat.routes||[]).map(r=>({...r,city:'osorno'}))];
    state.geo={type:'FeatureCollection',features:[...(geo.features||[]).map(f=>({...f,properties:{...f.properties,city:'valparaiso'}})),...(osGeo.features||[]).map(f=>({...f,properties:{...f.properties,city:'osorno'}}))]};
    drawVerified(); bind(); applyCity(false); const params=new URLSearchParams(location.search),initial=params.get('route'),requestedCity=params.get('city'); if(requestedCity==='osorno'){state.selectedCity='osorno';$('#cityFilter').value='osorno';applyCity(false)} render(); if(initial){const rec=cityCatalog().find(r=>norm(r.route_id)===norm(initial)); if(rec) setTimeout(()=>selectRoute(rec),0);}
  }
  function cityCatalog(){return state.catalog.filter(r=>r.city===state.selectedCity)}
  function cityFeatures(){return (state.geo.features||[]).filter(f=>f.properties?.city===state.selectedCity)}
  function updateGeometryNotice(){const features=cityFeatures(),keys=new Set(features.map(f=>routeKey(state.selectedCity,f.properties?.route_id)));const roadFollowing=features.filter(f=>String(f.properties?.geometry_quality||'').startsWith('road_following_')).length;const approximate=features.length-roadFollowing;$('#geometryNotice').textContent=features.length?`${keys.size} líneas · ${roadFollowing} sentidos siguiendo calles${approximate?` · ${approximate} aproximados por paradas`:''}.`:'Todavía no hay trazados cargados para esta ciudad.'}
  function applyCity(shouldFit=true){state.selectedUnit='';state.selectedLine=null;state.selectedDirection='';$('#unitFilter').innerHTML='<option value="">Todas las unidades</option>';$('#search').value='';populateUnits();populateLines();$('#mapTitle').textContent=`${cityName(state.selectedCity)} — Mapa de recorridos`;$('#mapSubtitle').textContent=state.selectedCity==='osorno'?'Todas las variantes urbanas de las líneas 1, 2, 3, 4, 5 y 7':'Catálogo de servicios actuales, transitorios e históricos';$('#search').placeholder=state.selectedCity==='osorno'?'Buscar línea, variante u operador…':'Buscar 209, E03, Q02, operador…';updateGeometryNotice();render();if(shouldFit)fitVisible()}
  function populateUnits(){
    const sel=$('#unitFilter'); [...new Set(cityCatalog().map(r=>r.unit))].sort().forEach(u=>{const o=document.createElement('option');o.value=u;o.textContent=u;sel.appendChild(o)});
  }
  function drawVerified(){
    for(const f of (state.geo.features||[])){
      const city=f.properties?.city||'valparaiso';const rid=String(f.properties?.route_id||''); const rec=state.catalog.find(r=>r.city===city&&norm(r.route_id)===norm(rid)); const color=rec?.ui_color||'#334155';
      const direction=f.properties?.direction||`Sentido ${(f.properties?.direction_index??0)+1}`;
      const stops=f.properties?.stop_count;
      const geometryQuality=String(f.properties?.geometry_quality||'');
      const geometryMethod=String(f.properties?.geometry_method||'');
      const isRoadFollowing=geometryQuality.startsWith('road_following_');
      const official=geometryMethod.includes('official_dtpr'),corridor=geometryMethod.includes('published_corridor');
      const isExact=geometryQuality==='road_following_rendered_route_trace'||official;
      const style=isRoadFollowing?{color,weight:5,opacity:.9}:{color,weight:3,opacity:.55,dashArray:'7 7'};
      const quality=official?'trazado oficial publicado en el GTFS de Red Regional':isExact?'trazado vial recuperado del mapa público de Moovit':corridor?'trazado por calles siguiendo el corredor publicado':isRoadFollowing?'trazado por calles calculado a través de la secuencia de paradas':'aproximación que une paradas; no representa las calles exactas';
      const source=official?'GTFS oficial de Red Regional (DTPR)':isExact?'mapa público de Moovit':corridor?'descripción pública del servicio y OSRM':isRoadFollowing?'OSRM y paradas públicas de Moovit':'página pública de Moovit';
      const waypointLabel=official?'paradas oficiales':corridor?'puntos del corredor':'paradas';
      const lyr=L.geoJSON(f,{style}).bindPopup(`<strong>${esc(rid)}</strong><br>${esc(direction)}${stops?` · ${esc(stops)} ${waypointLabel}`:''}<br>${esc(rec?.unit||'')} · ${esc(rec?.operator||'')}<br><small>Fuente: ${source} · ${quality}</small>`).addTo(state.map);
      const meta={layer:lyr,city,rid:norm(rid),routeId:rid,unit:rec?.unit||'',directionIndex:String(f.properties?.direction_index??0),direction,stops,waypointLabel,isExact:isRoadFollowing,routeColor:color};
      const key=routeKey(city,rid);if(!state.layers.has(key)) state.layers.set(key,[]); state.layers.get(key).push(meta); state.allLayers.push(meta);
    }
  }
  function populateLines(){
    const sel=$('#lineFilter'),previous=state.selectedLine;sel.innerHTML='<option value="">Todas las líneas</option>';
    cityCatalog().filter(r=>!state.selectedUnit||r.unit===state.selectedUnit).sort((a,b)=>String(a.route_id).localeCompare(String(b.route_id),undefined,{numeric:true})).forEach(r=>{const o=document.createElement('option');o.value=r.route_id;o.textContent=`${r.route_id} · ${r.operator}`;sel.appendChild(o)});
    const match=[...sel.options].find(o=>norm(o.value)===previous);sel.value=match?.value||'';state.selectedLine=match?previous:null;
    populateDirections();
  }
  function populateDirections(){
    const sel=$('#directionFilter');sel.innerHTML='<option value="">Todos los sentidos</option>';
    const directions=state.selectedLine?(state.layers.get(routeKey(state.selectedCity,state.selectedLine))||[]):[];
    directions.sort((a,b)=>Number(a.directionIndex)-Number(b.directionIndex)).forEach((m,i)=>{const o=document.createElement('option');o.value=m.directionIndex;o.textContent=`Sentido ${i+1}: ${m.direction}`;sel.appendChild(o)});
    sel.disabled=!directions.length;sel.value=directions.some(m=>m.directionIndex===state.selectedDirection)?state.selectedDirection:'';if(!sel.value)state.selectedDirection='';
    renderDirectionLegend(directions);
  }
  function renderDirectionLegend(directions){
    const box=$('#directionLegend');box.innerHTML='';box.classList.toggle('visible',directions.length>0);
    directions.forEach((m,i)=>{const b=document.createElement('button');b.type='button';b.className='direction-chip'+(state.selectedDirection===m.directionIndex?' active':'');b.innerHTML=`<span class="direction-dot" style="background:${directionColor(m.directionIndex)}"></span><span class="direction-label">Sentido ${i+1}: ${esc(m.direction)}</span><span class="direction-stops">${m.stops?`${esc(m.stops)} ${esc(m.waypointLabel||'paradas')}`:''}</span>`;b.addEventListener('click',()=>{state.selectedDirection=state.selectedDirection===m.directionIndex?'':m.directionIndex;$('#directionFilter').value=state.selectedDirection;render();fitScope()});box.appendChild(b)});
  }
  function bind(){
    $('#cityFilter').addEventListener('change',()=>{state.selectedCity=$('#cityFilter').value;applyCity()});
    $('#search').addEventListener('input',render);$('#statusFilter').addEventListener('change',render);
    $('#unitFilter').addEventListener('change',()=>{state.selectedUnit=$('#unitFilter').value;state.selectedLine=null;state.selectedDirection='';populateLines();render();fitScope()});
    $('#lineFilter').addEventListener('change',()=>{state.selectedLine=norm($('#lineFilter').value)||null;state.selectedDirection='';populateDirections();render();fitScope()});
    $('#directionFilter').addEventListener('change',()=>{state.selectedDirection=$('#directionFilter').value;render();fitScope()});
    $('#isolateSelection').addEventListener('change',render);
    $('#showAll').addEventListener('click',()=>{clearMapSelection();render();fitVisible()});
    $('#clearFilters').addEventListener('click',()=>{$('#search').value='';$('#statusFilter').value='';clearMapSelection();render();fitVisible()});
  }
  function clearMapSelection(){state.selectedUnit='';state.selectedLine=null;state.selectedDirection='';$('#unitFilter').value='';populateLines()}
  function filtered(){
    const q=norm($('#search').value),u=state.selectedUnit,s=$('#statusFilter').value,line=state.selectedLine;
    return cityCatalog().filter(r=>(!q||norm(r.route_id).includes(q)||norm(r.operator).includes(q)||norm(r.origin).includes(q)||norm(r.destination).includes(q)||norm((r.variants||[]).join(' ')).includes(q))&&(!u||r.unit===u)&&(!line||norm(r.route_id)===line)&&(!s||r.status===s));
  }
  function render(){
    const rows=filtered(); $('#count').textContent=`${rows.length} servicios en catálogo`;
    const box=$('#routeList'); box.innerHTML='';
    rows.forEach(r=>{const d=document.createElement('button');d.type='button';d.className='route-card'+(state.selectedLine===norm(r.route_id)?' active':'');
      const hasGeometry=state.layers.has(routeKey(state.selectedCity,r.route_id));
      d.innerHTML=`<div class="route-head"><span class="swatch" style="background:${esc(r.ui_color)}"></span><span class="route-id">${state.selectedCity==='osorno'?'Línea ':''}${esc(r.route_id)}</span><span>${esc(r.unit)}</span><span class="badge">${esc(r.status)}</span></div><div class="route-meta">${esc(r.operator)}${r.variants?.length?` · variantes ${esc(r.variants.join(', '))}`:''}${r.origin||r.destination?`<br>${esc(r.origin)} → ${esc(r.destination)}`:''}</div>${!hasGeometry?'<div class="route-warning">Esta línea todavía no tiene un trazado público verificable.</div>':''}`;
      d.addEventListener('click',()=>selectRoute(r));box.appendChild(d)});
    populateDirections();updateMapVisibility();
  }
  function selectRoute(r){state.selectedUnit=r.unit;$('#unitFilter').value=r.unit;state.selectedLine=norm(r.route_id);state.selectedDirection='';populateLines();const option=[...$('#lineFilter').options].find(o=>norm(o.value)===state.selectedLine);if(option)$('#lineFilter').value=option.value;populateDirections();render();fitScope();const first=(state.layers.get(routeKey(state.selectedCity,state.selectedLine))||[])[0];first?.layer.openPopup?.()}
  function updateMapVisibility(){
    const isolate=$('#isolateSelection').checked,hasScope=Boolean(state.selectedUnit||state.selectedLine||state.selectedDirection);
    for(const m of state.allLayers){
      if(m.city!==state.selectedCity){if(state.map.hasLayer(m.layer))state.map.removeLayer(m.layer);continue}
      const inUnit=!state.selectedUnit||m.unit===state.selectedUnit,inLine=!state.selectedLine||m.rid===state.selectedLine,inDirection=!state.selectedDirection||m.directionIndex===state.selectedDirection,primary=inUnit&&inLine&&inDirection;
      if(isolate&&hasScope&&!primary){if(state.map.hasLayer(m.layer))state.map.removeLayer(m.layer);continue}if(!state.map.hasLayer(m.layer))m.layer.addTo(state.map);
      if(hasScope&&!primary){m.layer.setStyle({color:'#64748b',opacity:.025,weight:1.5,dashArray:m.isExact?null:'4 7'});continue}
      if(state.selectedLine&&m.rid===state.selectedLine){m.layer.setStyle({color:directionColor(m.directionIndex),opacity:.96,weight:state.selectedDirection?7:6,dashArray:m.isExact?null:'8 6'});continue}
      m.layer.setStyle({color:m.routeColor,opacity:m.isExact?.86:.48,weight:m.isExact?4.5:3,dashArray:m.isExact?null:'7 7'});
    }
  }
  function scopedLayers(){return state.allLayers.filter(m=>m.city===state.selectedCity&&(!state.selectedUnit||m.unit===state.selectedUnit)&&(!state.selectedLine||m.rid===state.selectedLine)&&(!state.selectedDirection||m.directionIndex===state.selectedDirection)).map(m=>m.layer)}
  function fitScope(){updateMapVisibility();const layers=scopedLayers();if(layers.length)state.map.fitBounds(L.featureGroup(layers).getBounds().pad(.12))}
  function fitVisible(){updateMapVisibility();const all=state.allLayers.filter(m=>m.city===state.selectedCity).map(m=>m.layer);if(all.length)state.map.fitBounds(L.featureGroup(all).getBounds().pad(.08));else state.map.setView(cityView[state.selectedCity].center,cityView[state.selectedCity].zoom)}
  init().catch(err=>{$('#geometryNotice').textContent='Error cargando datos: '+err.message;console.error(err)});
})();
