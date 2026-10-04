(() => {
  const state={catalog:[], geo:null, map:null, layers:new Map(), selected:null};
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=s=>String(s||'').toUpperCase().replace(/[-\s]/g,'');

  async function init(){
    state.map=L.map('map',{preferCanvas:true}).setView([-33.02,-71.42],10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);
    const [catRes,geoRes]=await Promise.all([fetch('data/map/route_catalog.json'),fetch('data/map/routes.geojson')]);
    const cat=await catRes.json(); state.catalog=cat.routes||[]; state.geo=await geoRes.json();
    populateUnits(); drawVerified(); bind(); const initial=new URLSearchParams(location.search).get('route'); if(initial) state.selected=norm(initial); render(); if(initial){const rec=state.catalog.find(r=>norm(r.route_id)===state.selected); if(rec) setTimeout(()=>selectRoute(rec),0);}
    const n=state.geo.features?.length||0;
    const covered=state.layers.size;
    $('#geometryNotice').textContent=n?`${covered} líneas · ${n} sentidos cargados desde las secuencias de paradas publicadas por Moovit.`:'Todavía no hay trazados cargados en routes.geojson.';
  }
  function populateUnits(){
    const sel=$('#unitFilter'); [...new Set(state.catalog.map(r=>r.unit))].sort().forEach(u=>{const o=document.createElement('option');o.value=u;o.textContent=u;sel.appendChild(o)});
  }
  function drawVerified(){
    for(const f of (state.geo.features||[])){
      const rid=String(f.properties?.route_id||''); const rec=state.catalog.find(r=>norm(r.route_id)===norm(rid)); const color=rec?.ui_color||'#334155';
      const direction=f.properties?.direction||`Sentido ${(f.properties?.direction_index??0)+1}`;
      const stops=f.properties?.stop_count;
      const lyr=L.geoJSON(f,{style:{color,weight:4,opacity:.76}}).bindPopup(`<strong>${esc(rid)}</strong><br>${esc(direction)}${stops?` · ${esc(stops)} paradas`:''}<br>${esc(rec?.unit||'')} · ${esc(rec?.operator||'')}<br><small>Fuente: página pública de Moovit · recorrido enlazado por paradas</small>`).addTo(state.map);
      if(!state.layers.has(norm(rid))) state.layers.set(norm(rid),[]); state.layers.get(norm(rid)).push(lyr);
    }
  }
  function bind(){
    ['search','unitFilter','statusFilter'].forEach(id=>$('#'+id).addEventListener(id==='search'?'input':'change',render));
    $('#showAll').addEventListener('click',()=>{state.selected=null; render(); fitVisible()});
    $('#clearFilters').addEventListener('click',()=>{$('#search').value='';$('#unitFilter').value='';$('#statusFilter').value='';state.selected=null;render();});
  }
  function filtered(){
    const q=norm($('#search').value),u=$('#unitFilter').value,s=$('#statusFilter').value;
    return state.catalog.filter(r=>(!q||norm(r.route_id).includes(q)||norm(r.operator).includes(q)||norm(r.origin).includes(q)||norm(r.destination).includes(q))&&(!u||r.unit===u)&&(!s||r.status===s));
  }
  function render(){
    const rows=filtered(); $('#count').textContent=`${rows.length} servicios en catálogo`;
    const box=$('#routeList'); box.innerHTML='';
    rows.forEach(r=>{const d=document.createElement('button');d.type='button';d.className='route-card'+(state.selected===norm(r.route_id)?' active':'');
      const hasGeometry=state.layers.has(norm(r.route_id));
      d.innerHTML=`<div class="route-head"><span class="swatch" style="background:${esc(r.ui_color)}"></span><span class="route-id">${esc(r.route_id)}</span><span>${esc(r.unit)}</span><span class="badge">${esc(r.status)}</span></div><div class="route-meta">${esc(r.operator)}${r.origin||r.destination?` · ${esc(r.origin)} → ${esc(r.destination)}`:''}</div>${!hasGeometry?'<div class="route-warning">Esta línea todavía no aparece en las páginas públicas de Moovit.</div>':''}`;
      d.addEventListener('click',()=>selectRoute(r));box.appendChild(d)});
    updateLayerOpacity();
  }
  function selectRoute(r){state.selected=norm(r.route_id);render();const ls=state.layers.get(state.selected)||[];if(ls.length){const g=L.featureGroup(ls);state.map.fitBounds(g.getBounds().pad(.12));ls[0].openPopup?.()}}
  function updateLayerOpacity(){for(const [rid,ls] of state.layers){for(const l of ls){const selected=!state.selected||state.selected===rid;l.setStyle?.({opacity:selected ? .9 : .10,weight:state.selected===rid?6:4})}}}
  function fitVisible(){const all=[];for(const ls of state.layers.values())all.push(...ls);if(all.length)state.map.fitBounds(L.featureGroup(all).getBounds().pad(.08));}
  init().catch(err=>{$('#geometryNotice').textContent='Error cargando datos: '+err.message;console.error(err)});
})();
