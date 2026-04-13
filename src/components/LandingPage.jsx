/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

import React from 'react';

const IMG = process.env.PUBLIC_URL + '/images/';

/* ─── Séparateur décoratif (filigrane) — VALIDÉ ─── */
function VintageDivider({ image, alt, size = 'w-20 h-20', flip = false }) {
  return (
    <div className="flex justify-center py-6">
      <img
        src={IMG + image}
        alt={alt}
        className={`${size} object-contain opacity-30 ${flip ? 'scale-x-[-1]' : ''}`}
        loading="lazy"
      />
    </div>
  );
}

/* ─── Bouton image plaque vintage (Gemini) ─── */
function ImagePlateButton({ image, alt, onClick, className = '', height = 'h-14' }) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer group inline-block ${className}`}
      title={alt}
      style={{ padding: 0, margin: 0, background: 'none', border: 'none', outline: 'none', appearance: 'none', WebkitAppearance: 'none' }}
    >
      <img
        src={IMG + image}
        alt={alt}
        className={`${height} w-auto object-contain block
          drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]
          group-hover:drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]
          group-hover:brightness-110 group-active:brightness-90
          transition-all duration-200 ease-out
          group-hover:-translate-y-0.5 group-active:translate-y-0`}
      />
    </button>
  );
}

export default function LandingPage({ onStart }) {

  /* ─── Données fonctionnalités ─── */
  const features = [
    {
      icon: 'icone-route66.png',
      title: 'Zéro Autoroute',
      desc: 'Pas de péage, pas de voies rapides. Uniquement des routes de campagne goudronnées, jamais de chemins de terre.',
    },
    {
      icon: 'icone-compteur.png',
      title: '218 Véhicules',
      desc: 'De la Peugeot 201 à la Ferrari Dino, de la 2CV à la Shelby Cobra. Pentes adaptées à votre moteur.',
    },
    {
      icon: 'icone-boussole.png',
      title: 'Mode Boucle',
      desc: 'Un circuit circulaire depuis votre position, selon la durée souhaitée. Parfait pour la balade dominicale.',
    },
    {
      icon: 'icone-pompe.png',
      title: 'Stations SP98',
      desc: 'Localisation du carburant sans éthanol pour protéger vos durites et carburateurs anciens.',
    },
    {
      icon: 'icone-carte.png',
      title: 'Score Paysager',
      desc: "Un algorithme qui sélectionne les plus belles routes : vallonnées, bordées d'arbres, loin des grands axes.",
    },
    {
      icon: 'icone-roadbook.png',
      title: 'Export PDF & GPX',
      desc: 'Imprimez votre roadbook ou chargez la trace dans votre GPS embarqué. Carte + POI + profil altimétrique.',
    },
  ];

  /* ─── Données étapes ─── */
  const steps = [
    {
      num: '1',
      title: 'Choisir son véhicule',
      desc: "VintageRoute adapte l'itinéraire à VOTRE voiture : pentes adaptées à la puissance, durée de trajet réaliste, alertes sur les passages difficiles.",
    },
    {
      num: '2',
      title: 'Saisir le trajet',
      desc: "Point de départ, arrivée, jusqu'à 5 étapes intermédiaires. Ou optez pour le mode boucle : choisissez une durée et VintageRoute crée un circuit circulaire.",
    },
    {
      num: '3',
      title: 'Explorer le tracé',
      desc: "Profil altimétrique, points d'intérêt patrimoniaux avec photos et descriptions, météo, stations SP98 et score paysager de votre itinéraire.",
    },
    {
      num: '4',
      title: 'Exporter et partir',
      desc: 'Téléchargez la trace GPX pour votre appareil, imprimez le roadbook PDF avec carte et liste des POI. Mettez le contact !',
    },
  ];

  return (
    <div
      className="min-h-screen text-[#1e2d3a] font-sans selection:bg-[#c4a23d] selection:text-[#1e2d3a]"
      style={{ backgroundColor: '#f2edd8' }}
    >
      {/* ═══════════ HEADER / NAV ═══════════ */}
      <header
        className="flex justify-between items-center px-6 py-4 border-b-2 border-[#c4a23d]/40 sticky top-0 z-50"
        style={{ background: 'linear-gradient(135deg, #3a4a1e 0%, #5b6b2d 40%, #4a5a24 100%)' }}
      >
        <div className="flex items-center gap-3">
          <img
            src={process.env.PUBLIC_URL + '/logo-vintagroute.png'}
            alt="Logo VintageRoute"
            className="w-16 h-16 object-contain"
          />
          <span className="font-['Georgia',_serif] font-bold text-2xl text-[#f2edd8] tracking-wider">
            VintageRoute
          </span>
        </div>
        <ImagePlateButton image="btn-demarrer.png" alt="Démarrer" onClick={onStart} height="h-12 md:h-14" />
      </header>

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={IMG + 'hero-route.png'} alt="" className="w-full h-full object-cover" />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, rgba(242,237,216,0.2) 0%, rgba(242,237,216,0.65) 45%, rgba(242,237,216,0.97) 100%)',
            }}
          />
        </div>

        <div className="relative z-10 px-6 py-20 md:py-32 flex flex-col items-center text-center">
          <h1
            className="text-5xl md:text-7xl font-['Georgia',_serif] text-[#7a2e2e] mb-4 font-bold tracking-tight"
            style={{ textShadow: '0 2px 8px rgba(242,237,216,0.8)' }}
          >
            VintageRoute
          </h1>
          <h2 className="text-xl md:text-2xl text-[#5b6b2d] font-['Georgia',_serif] mb-8 italic">
            Navigation GPS pour voitures anciennes
          </h2>

          <p className="text-lg md:text-xl max-w-2xl mb-10 text-[#1e2d3a]/80 leading-relaxed">
            Redécouvrez le plaisir de conduire. Des itinéraires sur les plus belles routes de campagne,
            adaptés à la mécanique de votre véhicule de collection.
          </p>

          <ImagePlateButton image="btn-planifier.png" alt="Planifier mon itinéraire" onClick={onStart} height="h-28 md:h-36" />

          <p className="mt-6 text-sm text-[#5b6b2d] font-semibold">
            100% gratuit · Sans compte · Sans publicité
          </p>
        </div>
      </section>

      {/* ═══════════ SÉPARATEUR : CALANDRE ═══════════ */}
      <VintageDivider image="calandre-vintage.png" alt="Calandre vintage" size="w-24 h-24" />

      {/* ═══════════ FONCTIONNALITÉS ═══════════ */}
      <section className="px-6 py-16" style={{ background: 'linear-gradient(180deg, #1e2d3a 0%, #263845 100%)' }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-['Georgia',_serif] text-[#c4a23d] text-center mb-4">
            Conçu pour l'Automobile de Collection
          </h2>
          <p className="text-center text-[#f2edd8]/60 mb-14 text-lg max-w-2xl mx-auto">
            Chaque fonctionnalité a été pensée pour les passionnés qui roulent en anciennes.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-5 p-5 rounded-xl border border-[#f2edd8]/10
                  hover:border-[#c4a23d]/30 transition-colors"
                style={{ backgroundColor: 'rgba(242,237,216,0.06)' }}
              >
                {/* Image icône vintage */}
                <div className="shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-lg overflow-hidden shadow-lg border border-[#c4a23d]/20">
                  <img
                    src={IMG + f.icon}
                    alt={f.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                {/* Texte */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold mb-1.5 font-['Georgia',_serif] text-[#f2edd8]">
                    {f.title}
                  </h3>
                  <p className="text-[#f2edd8]/70 text-base leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ SÉPARATEUR : VOLANT ═══════════ */}
      <VintageDivider image="volant-vintage.png" alt="Volant vintage" size="w-28 h-28" />

      {/* ═══════════ COMMENT ÇA MARCHE ═══════════ */}
      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-['Georgia',_serif] text-[#5b6b2d] text-center mb-4">
            Comment ça marche
          </h2>
          <p className="text-center text-[#1e2d3a]/60 mb-14 text-lg">
            Quatre étapes pour prendre la route l'esprit tranquille.
          </p>

          <div className="flex flex-col gap-8">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-4 md:gap-6">
                {/* Sticker de course vintage (image découpée) */}
                <div className="shrink-0 w-16 h-20 md:w-20 md:h-24">
                  <img
                    src={IMG + 'sticker-' + step.num + '.png'}
                    alt={'Étape ' + step.num}
                    className="w-full h-full object-contain drop-shadow-lg"
                  />
                </div>

                {/* Texte sur pancarte enseigne vintage */}
                <div
                  className="flex-1 shadow-lg"
                  style={{
                    borderImage: `url(${IMG}enseigne-garage.png) 58 fill / 24px`,
                    borderStyle: 'solid',
                    borderWidth: '24px',
                  }}
                >
                  <div className="py-2 px-2 md:py-3 md:px-4">
                    <h3 className="text-xl font-bold font-['Georgia',_serif] text-[#1e2d3a] mb-2">
                      {step.title}
                    </h3>
                    <p className="text-base text-[#1e2d3a]/80 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ SÉPARATEUR : PHARE ═══════════ */}
      <VintageDivider image="phare-vintage.png" alt="Phare vintage" size="w-24 h-24" />

      {/* ═══════════ ZONE DE COUVERTURE ═══════════ */}
      <section className="px-6 py-16 border-y border-[#d0c8b0]" style={{ backgroundColor: '#f7f3e8' }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-['Georgia',_serif] text-[#5b6b2d] text-center mb-4">
            Couverture nationale
          </h2>
          <p className="text-center text-[#1e2d3a]/60 mb-12 text-lg max-w-2xl mx-auto">
            Le calcul d'itinéraire fonctionne <strong>partout en France métropolitaine</strong>.
            VintageRoute vérifie la qualité du revêtement sur <strong>96 départements</strong>{' '}
            pour vous éviter les chemins de terre et les routes empierrées.
          </p>

          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="w-full md:w-2/5">
              <h3 className="text-xl font-bold font-['Georgia',_serif] text-[#7a2e2e] mb-4">
                Vérification du revêtement
              </h3>
              <p className="text-base text-[#1e2d3a]/80 mb-4 leading-relaxed">
                Grâce aux données de la <strong>BD TOPO de l'IGN</strong>, VintageRoute détecte
                automatiquement les chemins de terre, sentiers et routes empierrées
                inadaptées à votre véhicule ancien.
              </p>
              <div className="bg-white rounded-lg p-4 border border-[#d0c8b0] shadow-sm mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl font-bold font-['Georgia',_serif] text-[#7a2e2e]">96</span>
                  <span className="text-base text-[#1e2d3a]/80">départements couverts</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold font-['Georgia',_serif] text-[#5b6b2d]">100%</span>
                  <span className="text-base text-[#1e2d3a]/80">France métropolitaine</span>
                </div>
              </div>
              <p className="text-sm text-[#1e2d3a]/60 leading-relaxed">
                Les données sont chargées à la demande : seuls les départements traversés
                par votre itinéraire sont téléchargés, pour un chargement rapide.
              </p>
            </div>

            <div className="w-full md:w-3/5">
              <div
                className="rounded-xl overflow-hidden shadow-xl border-2 border-[#c4a23d]/30"
                style={{
                  boxShadow:
                    '0 8px 32px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(196,162,61,0.2)',
                }}
              >
                <img
                  src={IMG + 'carte-souterraine.png'}
                  alt="Carte vintage — couverture nationale BD TOPO"
                  className="w-full h-auto"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ AUSSI POUR LES MOTARDS ═══════════ */}
      <section
        className="px-6 py-14 text-center"
        style={{ background: 'linear-gradient(135deg, #5b6b2d 0%, #4a5724 100%)' }}
      >
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-['Georgia',_serif] text-[#f2edd8] mb-4">
            Aussi pour les motards
          </h2>
          <p className="text-base text-[#f2edd8]/80 leading-relaxed">
            Amis motards, VintageRoute partage votre philosophie. Routes sinueuses, zéro autoroute et
            mode boucle répondent parfaitement à l'esprit deux-roues.
          </p>
        </div>
      </section>

      {/* ═══════════ SÉPARATEUR : CALANDRE INVERSÉE ═══════════ */}
      <VintageDivider image="calandre-vintage.png" alt="" size="w-20 h-20" flip={true} />

      {/* ═══════════ À VENIR ═══════════ */}
      <section className="px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-['Georgia',_serif] text-[#c4a23d] text-center mb-10">
            À venir
          </h2>
          <div className="bg-white p-6 md:p-8 rounded-xl shadow-md border border-[#d0c8b0]">
            <ul className="space-y-5 text-base">
              {[
                {
                  title: 'Navigation guidée',
                  desc: 'Guidage vocal et visuel en temps réel, virage par virage, comme un copilote.',
                },
                {
                  title: 'Partage entre clubs',
                  desc: 'Publiez vos plus belles balades, notez-les et partagez-les avec d\'autres passionnés.',
                },
                {
                  title: 'Itinéraire le moins pentu',
                  desc: 'Un tracé qui privilégie les routes plates, idéal pour les moteurs les plus fragiles.',
                },
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 text-[#c4a23d]">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                  </span>
                  <span>
                    <strong className="text-[#1e2d3a]">{item.title} :</strong>{' '}
                    <span className="text-[#1e2d3a]/70">{item.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer
        className="px-6 py-10 text-center"
        style={{ background: 'linear-gradient(180deg, #7a2e2e 0%, #5a1e1e 100%)' }}
      >
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
          <img
            src={IMG + 'phare-vintage.png'}
            alt=""
            className="w-14 h-14 object-contain opacity-40 mb-2"
            loading="lazy"
          />
          <h2 className="text-xl font-['Georgia',_serif] text-[#f2edd8]">VintageRoute</h2>
          <p className="text-base font-semibold text-[#f2edd8]/90">
            100% gratuit · Sans compte · Sans publicité
          </p>
          <div className="w-20 h-px bg-[#f2edd8]/20 my-2" />
          <p className="text-sm text-[#f2edd8]/60">© 2026 Yves — Sous licence CC BY-NC-SA 4.0</p>
          <a
            href="https://github.com/YvesSab/vintagroute"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[#c4a23d] hover:text-[#f2edd8] transition-colors p-2 min-h-[44px] text-sm"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path
                fillRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.013 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                clipRule="evenodd"
              />
            </svg>
            Code source sur GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
