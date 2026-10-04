(() => {
  const state={catalog:[], geo:null, map:null, layers:new Map(), allLayers:[], selectedUnit:'', selectedLine:null, selectedDirection:''};
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=s=>String(s||'').toUpperCase().replace(/[-\s]/g,'');
  const directionPalette=['#0077b6','#e76f51','#7b2cbf','#2a9d8f','#d97706'];
  const directionColor=index=>directionPalette[(Number.parseInt(index,10)||0)%directionPalette.length];

  async function init(){
    state.map=L.map('map',{preferCanvas:true}).setView([-33.02,-71.42],10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);
    const [catRes,geoRes]=await Promise.all([fetch('data/map/route_catalog.json?v=20261004-3'),fetch('data/map/routes.geojson?v=20261004-3')]);
    const cat=await catRes.json(); state.catalog=cat.routes||[]; state.geo=await geoRes.json();
    populateUnits(); drawVerified(); populateLines(); bind(); const initial=new URLSearchParams(location.search).get('route'); render(); if(initial){const rec=state.catalog.find(r=>norm(r.route_id)===norm(initial)); if(rec) setTimeout(()=>selectRoute(rec),0);}
    const n=state.geo.features?.length||0;
    const covered=state.layers.size;
    const roadFollowing=(state.geo.features||[]).filter(f=>String(f.properties?.geometry_quality||'').startsWith('road_following_')).length;
    const approximate=n-roadFollowing;
    $('#geometryNotice').textContent=n?`${covered} líneas · ${roadFollowing} sentidos siguiendo calles${approximate?` · ${approximate} aproximados por paradas (línea discontinua)`:''}.`:'Todavía no hay trazados cargados en routes.geojson.';
  }
  function populateUnits(){
    const sel=$('#unitFilter'); [...new Set(state.catalog.map(r=>r.unit))].sort().forEach(u=>{const o=document.createElement('option');o.value=u;o.textContent=u;sel.appendChild(o)});
  }
  function drawVerified(){
    for(const f of (state.geo.features||[])){
      const rid=String(f.properties?.route_id||''); const rec=state.catalog.find(r=>norm(r.route_id)===norm(rid)); const color=rec?.ui_color||'#334155';
      const direction=f.properties?.direction||`Sentido ${(f.properties?.direction_index??0)+1}`;
      const stops=f.properties?.stop_count;
      const geometryQuality=String(f.properties?.geometry_quality||'');
      const isRoadFollowing=geometryQuality.startsWith('road_following_');
      const isExact=geometryQuality==='road_following_rendered_route_trace';
      const style=isRoadFollowing?{color,weight:5,opacity:.9}:{color,weight:3,opacity:.55,dashArray:'7 7'};
      const quality=isExact?'trazado vial recuperado del mapa público de Moovit':isRoadFollowing?'trazado por calles calculado a través de la secuencia de paradas':'aproximación que une paradas; no representa las calles exactas';
      const source=isExact?'mapa público de Moovit':isRoadFollowing?'OSRM y paradas públicas de Moovit':'página pública de Moovit';
      const lyr=L.geoJSON(f,{style}).bindPopup(`<strong>${esc(rid)}</strong><br>${esc(direction)}${stops?` · ${esc(stops)} paradas`:''}<br>${esc(rec?.unit||'')} · ${esc(rec?.operator||'')}<br><small>Fuente: ${source} · ${quality}</small>`).addTo(state.map);
      const meta={layer:lyr,rid:norm(rid),routeId:rid,unit:rec?.unit||'',directionIndex:String(f.properties?.direction_index??0),direction,stops,isExact:isRoadFollowing,routeColor:color};
      if(!state.layers.has(meta.rid)) state.layers.set(meta.rid,[]); state.layers.get(meta.rid).push(meta); state.allLayers.push(meta);
    }
  }
  function populateLines(){
    const sel=$('#lineFilter'),previous=state.selectedLine;sel.innerHTML='<option value="">Todas las líneas</option>';
    state.catalog.filter(r=>!state.selectedUnit||r.unit===state.selectedUnit).sort((a,b)=>String(a.route_id).localeCompare(String(b.route_id),undefined,{numeric:true})).forEach(r=>{const o=document.createElement('option');o.value=r.route_id;o.textContent=`${r.route_id} · ${r.operator}`;sel.appendChild(o)});
    const match=[...sel.options].find(o=>norm(o.value)===previous);sel.value=match?.value||'';state.selectedLine=match?previous:null;
    populateDirections();
  }
  function populateDirections(){
    const sel=$('#directionFilter');sel.innerHTML='<option value="">Todos los sentidos</option>';
    const directions=state.selectedLine?(state.layers.get(state.selectedLine)||[]):[];
    directions.sort((a,b)=>Number(a.directionIndex)-Number(b.directionIndex)).forEach((m,i)=>{const o=document.createElement('option');o.value=m.directionIndex;o.textContent=`Sentido ${i+1}: ${m.direction}`;sel.appendChild(o)});
    sel.disabled=!directions.length;sel.value=directions.some(m=>m.directionIndex===state.selectedDirection)?state.selectedDirection:'';if(!sel.value)state.selectedDirection='';
    renderDirectionLegend(directions);
  }
  function renderDirectionLegend(directions){
    const box=$('#directionLegend');box.innerHTML='';box.classList.toggle('visible',directions.length>0);
    directions.forEach((m,i)=>{const b=document.createElement('button');b.type='button';b.className='direction-chip'+(state.selectedDirection===m.directionIndex?' active':'');b.innerHTML=`<span class="direction-dot" style="background:${directionColor(m.directionIndex)}"></span><span class="direction-label">Sentido ${i+1}: ${esc(m.direction)}</span><span class="direction-stops">${m.stops?`${esc(m.stops)} paradas`:''}</span>`;b.addEventListener('click',()=>{state.selectedDirection=state.selectedDirection===m.directionIndex?'':m.directionIndex;$('#directionFilter').value=state.selectedDirection;render();fitScope()});box.appendChild(b)});
  }
  function bind(){
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
    return state.catalog.filter(r=>(!q||norm(r.route_id).includes(q)||norm(r.operator).includes(q)||norm(r.origin).includes(q)||norm(r.destination).includes(q))&&(!u||r.unit===u)&&(!line||norm(r.route_id)===line)&&(!s||r.status===s));
  }
  function render(){
    const rows=filtered(); $('#count').textContent=`${rows.length} servicios en catálogo`;
    const box=$('#routeList'); box.innerHTML='';
    rows.forEach(r=>{const d=document.createElement('button');d.type='button';d.className='route-card'+(state.selectedLine===norm(r.route_id)?' active':'');
      const hasGeometry=state.layers.has(norm(r.route_id));
      d.innerHTML=`<div class="route-head"><span class="swatch" style="background:${esc(r.ui_color)}"></span><span class="route-id">${esc(r.route_id)}</span><span>${esc(r.unit)}</span><span class="badge">${esc(r.status)}</span></div><div class="route-meta">${esc(r.operator)}${r.origin||r.destination?` · ${esc(r.origin)} → ${esc(r.destination)}`:''}</div>${!hasGeometry?'<div class="route-warning">Esta línea todavía no aparece en las páginas públicas de Moovit.</div>':''}`;
      d.addEventListener('click',()=>selectRoute(r));box.appendChild(d)});
    populateDirections();updateMapVisibility();
  }
  function selectRoute(r){state.selectedUnit=r.unit;$('#unitFilter').value=r.unit;state.selectedLine=norm(r.route_id);state.selectedDirection='';populateLines();const option=[...$('#lineFilter').options].find(o=>norm(o.value)===state.selectedLine);if(option)$('#lineFilter').value=option.value;populateDirections();render();fitScope();const first=(state.layers.get(state.selectedLine)||[])[0];first?.layer.openPopup?.()}
  function updateMapVisibility(){
    const isolate=$('#isolateSelection').checked,hasScope=Boolean(state.selectedUnit||state.selectedLine||state.selectedDirection);
    for(const m of state.allLayers){
      const inUnit=!state.selectedUnit||m.unit===state.selectedUnit,inLine=!state.selectedLine||m.rid===state.selectedLine,inDirection=!state.selectedDirection||m.directionIndex===state.selectedDirection,primary=inUnit&&inLine&&inDirection;
      if(isolate&&hasScope&&!primary){if(state.map.hasLayer(m.layer))state.map.removeLayer(m.layer);continue}if(!state.map.hasLayer(m.layer))m.layer.addTo(state.map);
      if(hasScope&&!primary){m.layer.setStyle({color:'#64748b',opacity:.025,weight:1.5,dashArray:m.isExact?null:'4 7'});continue}
      if(state.selectedLine&&m.rid===state.selectedLine){m.layer.setStyle({color:directionColor(m.directionIndex),opacity:.96,weight:state.selectedDirection?7:6,dashArray:m.isExact?null:'8 6'});continue}
      m.layer.setStyle({color:m.routeColor,opacity:m.isExact?.86:.48,weight:m.isExact?4.5:3,dashArray:m.isExact?null:'7 7'});
    }
  }
  function scopedLayers(){return state.allLayers.filter(m=>(!state.selectedUnit||m.unit===state.selectedUnit)&&(!state.selectedLine||m.rid===state.selectedLine)&&(!state.selectedDirection||m.directionIndex===state.selectedDirection)).map(m=>m.layer)}
  function fitScope(){updateMapVisibility();const layers=scopedLayers();if(layers.length)state.map.fitBounds(L.featureGroup(layers).getBounds().pad(.12))}
  function fitVisible(){const all=state.allLayers.map(m=>m.layer);if(all.length)state.map.fitBounds(L.featureGroup(all).getBounds().pad(.08));}
  init().catch(err=>{$('#geometryNotice').textContent='Error cargando datos: '+err.message;console.error(err)});
})();
