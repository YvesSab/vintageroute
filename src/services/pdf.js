/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

let jsPDFModule = null;
async function loadJsPDF() {
  if (!jsPDFModule) jsPDFModule = await import('jspdf');
  return jsPDFModule.jsPDF || jsPDFModule.default;
}

function stripEmoji(str) {
  if (!str) return '';
  return str.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').replace(/[\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
}

function truncate(s, n) { return s && s.length > n ? s.substring(0, n - 1) + '...' : (s || ''); }

const TYPE_LABEL = {
  viewpoint: 'Vue', restaurant: 'Resto', hotel: 'Hotel',
  historic: 'Monum.', picnic: 'Pique-n.', village: 'Village', sp98: 'SP98',
};

/**
 * PDF A4 paysage enrichi (tâche 2.20).
 * Page 1 : carte avec numeros POI + résumé
 * Page 2 : liste POI détaillée avec numéros correspondants
 */
export async function exportPDF(mapContainer, mapInstance, params) {
  const jsPDF = await loadJsPDF();

  // Capturer la carte
  let imgData;
  try { imgData = mapInstance.getCanvas().toDataURL('image/png'); }
  catch (e) {
    try { const h = await import('html2canvas'); imgData = (await (h.default||h)(mapContainer, {useCORS:true,scale:2,logging:false})).toDataURL('image/png'); }
    catch (e2) { throw new Error("Capture carte impossible"); }
  }

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, H = 210, m = 10;

  // ══════════ PAGE 1 : CARTE ══════════
  pdf.setFontSize(22); pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 45, 58);
  pdf.text('VintageRoute', m, m + 9);

  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(120, 120, 120);
  pdf.text(new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }), W - m, m + 9, { align: 'right' });

  let y = m + 15;
  if (params.vehicle) {
    pdf.setFontSize(11); pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(91, 107, 45);
    pdf.text(`${params.vehicle.marque} ${params.vehicle.modele} (${params.vehicle.vmax || '?'} km/h max)`, m, y);
    y += 6;
  }

  pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(30, 45, 58);
  const dist = params.distance < 1 ? `${Math.round(params.distance * 1000)} m` : `${params.distance.toFixed(1)} km`;
  const dH = Math.floor(params.duration / 60), dM = Math.round(params.duration % 60);
  const dur = dH > 0 ? `${dH} h ${dM} min` : `${dM} min`;
  let line1 = `Distance : ${dist}   |   Duree : ${dur}`;
  if (params.elevationData) line1 += `   |   Denivele : +${params.elevationData.totalUp} m / -${params.elevationData.totalDown} m`;
  pdf.text(line1, m, y); y += 5;

  if (params.filterStats?.forbidden > 0) {
    pdf.setTextColor(122, 46, 46); pdf.setFontSize(9);
    pdf.text('/!\\ Chemins / sentiers detectes sur le parcours', m, y); y += 4;
  }
  if (params.filterStats?.warning > 0) {
    pdf.setTextColor(201, 123, 50); pdf.setFontSize(9);
    pdf.text('/!\\ Routes empierrees detectees sur le parcours', m, y); y += 4;
  }
  if (params.waypoints?.length > 0) {
    pdf.setFontSize(9); pdf.setTextColor(91, 107, 45);
    const etapes = params.waypoints.map(w => `[${TYPE_LABEL[w.type] || ''}] ${stripEmoji(w.label)}`).join('  >  ');
    pdf.text(truncate(`Etapes : ${etapes}`, 120), m, y); y += 5;
  }
  y += 1;

  // Carte
  const cH = H - y - m - 6;
  const canvas = mapInstance.getCanvas();
  const ratio = canvas.width / canvas.height;
  let iW = W - m * 2, iH = iW / ratio;
  if (iH > cH) { iH = cH; iW = iH * ratio; }
  const imgX = m, imgY = y;
  pdf.addImage(imgData, 'PNG', imgX, imgY, iW, iH);

  // Numéros POI sur la carte
  if (params.pois?.length > 0) {
    const maxPoisOnMap = Math.min(params.pois.length, 25);
    const canvasW = canvas.width, canvasH = canvas.height;

    for (let i = 0; i < maxPoisOnMap; i++) {
      const poi = params.pois[i];
      try {
        // Convertir coordonnées géo → pixels carte
        const pixel = mapInstance.project([poi.lon, poi.lat]);
        if (!pixel || pixel.x < 0 || pixel.y < 0 || pixel.x > canvasW || pixel.y > canvasH) continue;

        // Convertir pixels carte → coordonnées PDF
        const pdfX = imgX + (pixel.x / canvasW) * iW;
        const pdfY = imgY + (pixel.y / canvasH) * iH;

        // Dessiner un cercle numéroté
        const r = 2.5; // rayon du cercle en mm
        pdf.setFillColor(122, 46, 46); // bordeaux
        pdf.circle(pdfX, pdfY, r, 'F');
        pdf.setFontSize(6); pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(255, 255, 255);
        const numStr = String(i + 1);
        pdf.text(numStr, pdfX, pdfY + 0.8, { align: 'center' });
      } catch (e) {
        // POI hors de la vue — ignorer
      }
    }
  }

  pdf.setFontSize(7); pdf.setTextColor(160, 160, 160); pdf.setFont('helvetica', 'normal');
  pdf.text('(c) 2026 VintageRoute - vintagroute.netlify.app', W / 2, H - 3, { align: 'center' });

  // ══════════ PAGE 2 : DÉTAILS ══════════
  const hasElev = params.elevationData?.profile?.length > 0;
  const hasPois = params.pois?.length > 0;

  if (hasElev || hasPois) {
    pdf.addPage('a4', 'landscape');
    y = m;

    pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 45, 58);
    pdf.text('Details de l\'itineraire', m, y + 7); y += 14;

    // Profil altimétrique
    if (hasElev) {
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 45, 58);
      pdf.text('Profil altimetrique', m, y); y += 3;

      const prof = params.elevationData.profile;
      const cW = W - m * 2, cHt = 35, cY = y;

      pdf.setFillColor(245, 243, 235);
      pdf.rect(m, cY, cW, cHt, 'F');
      pdf.setDrawColor(220, 220, 220); pdf.setLineWidth(0.3);
      pdf.rect(m, cY, cW, cHt);

      let minA = Infinity, maxA = -Infinity;
      for (const p of prof) { if (p.alt < minA) minA = p.alt; if (p.alt > maxA) maxA = p.alt; }
      const aR = Math.max(1, maxA - minA);
      const mD = prof[prof.length - 1]?.dist || 1;

      pdf.setDrawColor(91, 107, 45); pdf.setLineWidth(0.8);
      for (let i = 1; i < prof.length; i++) {
        const x1 = m + (prof[i-1].dist / mD) * cW;
        const y1 = cY + cHt - ((prof[i-1].alt - minA) / aR) * (cHt - 6) - 3;
        const x2 = m + (prof[i].dist / mD) * cW;
        const y2 = cY + cHt - ((prof[i].alt - minA) / aR) * (cHt - 6) - 3;
        pdf.line(x1, y1, x2, y2);
      }

      pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 100, 100);
      pdf.text(`${Math.round(maxA)} m`, m + 2, cY + 6);
      pdf.text(`${Math.round(minA)} m`, m + 2, cY + cHt - 3);
      pdf.text('0 km', m + 1, cY + cHt + 4);
      pdf.text(`${mD.toFixed(1)} km`, m + cW - 12, cY + cHt + 4);

      y = cY + cHt + 8;
      pdf.setFontSize(9); pdf.setTextColor(30, 45, 58);
      pdf.text(`Denivele + : ${params.elevationData.totalUp} m    Denivele - : ${params.elevationData.totalDown} m    Altitude : ${Math.round(minA)} - ${Math.round(maxA)} m`, m, y);
      y += 8;
    }

    // Liste POI numérotée avec détails
    if (hasPois) {
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 45, 58);
      pdf.text(`Points d'interet (${params.pois.length}) — numeros = reperes sur la carte`, m, y);
      y += 5;

      // Résumé par type
      const tc = {};
      for (const p of params.pois) tc[p.type] = (tc[p.type] || 0) + 1;
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(120, 120, 120);
      const labels = { viewpoint: 'points de vue', restaurant: 'restaurants', hotel: 'hotels', historic: 'monuments', picnic: 'aires pique-nique' };
      pdf.text(Object.entries(tc).map(([t, c]) => `${c} ${labels[t] || t}`).join(' - '), m, y);
      y += 5;

      const colW = (W - m * 2) / 2;
      let col = 0, rowY = y;
      const startY = y;

      pdf.setFontSize(7.5);
      const maxPois = Math.min(params.pois.length, 50);

      for (let i = 0; i < maxPois; i++) {
        const poi = params.pois[i];
        const x = m + col * colW;

        if (rowY > H - 12 && col === 0) { col = 1; rowY = startY; }
        if (rowY > H - 12 && col === 1) {
          if (i < maxPois - 1) {
            pdf.setFontSize(7); pdf.setTextColor(140, 140, 140);
            pdf.text(`... et ${params.pois.length - i} autres`, x, rowY);
          }
          break;
        }

        // Numéro + type + nom
        const num = String(i + 1).padStart(2, ' ');
        const prefix = TYPE_LABEL[poi.type] || '';
        pdf.setTextColor(122, 46, 46); pdf.setFont('helvetica', 'bold');
        pdf.text(`${num}.`, x, rowY);
        pdf.setTextColor(91, 107, 45);
        pdf.text(`[${prefix}]`, x + 6, rowY);
        pdf.setTextColor(30, 45, 58); pdf.setFont('helvetica', 'bold');
        pdf.text(truncate(poi.name, 38), x + 17, rowY);

        // Ligne de détails
        const details = [];
        if (poi.subtype && poi.name !== poi.subtype) details.push(poi.subtype);
        if (poi.cuisine) details.push(poi.cuisine);
        if (poi.address) details.push(poi.address);
        if (poi.openingHours) details.push('Horaires: ' + poi.openingHours);
        if (poi.phone) details.push('Tel: ' + poi.phone);
        if (poi.website) details.push(poi.website.replace(/^https?:\/\//, '').substring(0, 30));

        if (details.length > 0) {
          pdf.setFont('helvetica', 'normal'); pdf.setTextColor(140, 140, 140);
          pdf.text(truncate(details.join(' | '), 60), x + 6, rowY + 3);
          rowY += 3.5;
        }

        rowY += 4.5;
      }
    }

    pdf.setFontSize(7); pdf.setTextColor(160, 160, 160); pdf.setFont('helvetica', 'normal');
    pdf.text('(c) 2026 VintageRoute - vintagroute.netlify.app', W / 2, H - 3, { align: 'center' });
  }

  const d = new Date();
  pdf.save(`vintagroute-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.pdf`);
}
