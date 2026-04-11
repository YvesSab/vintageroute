#!/usr/bin/env python3
"""
VintageRoute — Conversion BD TOPO GPKG → JSON léger
© 2026 Yves — Tous droits réservés
Licence : CC BY-NC-SA 4.0

Usage :
    python convert-bdtopo.py <fichier.gpkg> <dept_code> [output_dir]

Exemple :
    python convert-bdtopo.py BDTOPO_3-5_TOUSTHEMES_GPKG_LAMB93_D087_2025-12-15.gpkg 87 ../frontend/public/bdtopo/

Prérequis :
    pip install geopandas pyproj
    (ou conda install geopandas pyproj)

Le script :
1. Lit la couche "troncon_de_route" du fichier GPKG
2. Convertit de Lambert 93 (EPSG:2154) vers WGS84 (EPSG:4326)
3. Classe chaque tronçon selon l'attribut "nature" :
   - "Chemin", "Sentier" → forbidden (f)
   - "Route empierrée" → warning (w)
   - Le reste → ok (o)
4. Ne garde que les tronçons forbidden/warning (les OK sont inutiles)
5. Exporte en JSON léger : {features: [{c: [[lng,lat],...], n: "nature", s: "f|w|o"}, ...]}
"""

import sys
import os
import json

try:
    import geopandas as gpd
except ImportError:
    print("ERREUR : geopandas requis. Installez avec : pip install geopandas pyproj")
    sys.exit(1)


# Classification des natures BD TOPO
NATURE_STATUS = {
    "Chemin": "f",           # forbidden
    "Sentier": "f",          # forbidden
    "Route empierrée": "w",  # warning
    "Piste cyclable": "f",   # forbidden
    "Escalier": "f",         # forbidden
}


def convert_bdtopo(gpkg_path, dept_code, output_dir="."):
    """Convertit un fichier GPKG BD TOPO en JSON léger."""

    print(f"Lecture de {gpkg_path}…")

    # Lire la couche troncon_de_route
    try:
        gdf = gpd.read_file(gpkg_path, layer="troncon_de_route")
    except Exception as e:
        print(f"ERREUR lecture couche troncon_de_route : {e}")
        print("Couches disponibles :")
        import fiona
        for layer in fiona.listlayers(gpkg_path):
            print(f"  - {layer}")
        sys.exit(1)

    print(f"  {len(gdf)} tronçons lus")

    # Vérifier le CRS et reprojeter si nécessaire
    if gdf.crs and gdf.crs.to_epsg() != 4326:
        print(f"  Reprojection de {gdf.crs} vers WGS84 (EPSG:4326)…")
        gdf = gdf.to_crs(epsg=4326)

    # Extraire et classifier
    features = []
    stats = {"ok": 0, "warning": 0, "forbidden": 0}

    for _, row in gdf.iterrows():
        nature = row.get("nature", "") or ""
        geom = row.geometry

        if geom is None or geom.is_empty:
            continue

        status = NATURE_STATUS.get(nature, "o")
        stats_key = {"f": "forbidden", "w": "warning", "o": "ok"}[status]
        stats[stats_key] += 1

        # Ne garder que les tronçons problématiques (warning + forbidden)
        # Les "ok" sont inutiles — si pas de match BD TOPO, on considère OK
        if status == "o":
            continue

        # Extraire les coordonnées
        if geom.geom_type == "LineString":
            coords = [[round(x, 6), round(y, 6)] for x, y in geom.coords]
        elif geom.geom_type == "MultiLineString":
            # Aplatir en une seule liste (rare mais possible)
            coords = []
            for line in geom.geoms:
                coords.extend([[round(x, 6), round(y, 6)] for x, y in line.coords])
        else:
            continue

        if len(coords) < 2:
            continue

        features.append({
            "c": coords,    # coordinates [[lng, lat], ...]
            "n": nature,    # nature (texte original)
            "s": status,    # status: "f" = forbidden, "w" = warning
        })

    print(f"  Classification : {stats['ok']} OK, {stats['warning']} empierrées, {stats['forbidden']} chemins/sentiers")
    print(f"  {len(features)} tronçons à signaler exportés")

    # Écrire le JSON
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"dept-{dept_code}.json")

    output = {"features": features}
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_bytes = os.path.getsize(output_path)
    size_mb = size_bytes / (1024 * 1024)
    print(f"  → {output_path} ({size_mb:.1f} Mo)")
    print(f"  (estimation gzippé : ~{size_mb * 0.19:.1f} Mo)")

    return output_path


def main():
    if len(sys.argv) < 3:
        print("Usage : python convert-bdtopo.py <fichier.gpkg> <dept_code> [output_dir]")
        print()
        print("Exemples :")
        print("  python convert-bdtopo.py BDTOPO_D087.gpkg 87")
        print("  python convert-bdtopo.py BDTOPO_D087.gpkg 87 ../frontend/public/bdtopo/")
        print()
        print("Départements supportés : 23, 87, 19, 36, 03, 63, 18")
        print()
        print("Téléchargement BD TOPO :")
        print("  https://geoservices.ign.fr/bdtopo")
        print("  Format GPKG, gratuit, sans compte")
        sys.exit(1)

    gpkg_path = sys.argv[1]
    dept_code = sys.argv[2]
    output_dir = sys.argv[3] if len(sys.argv) > 3 else "."

    if not os.path.exists(gpkg_path):
        print(f"ERREUR : fichier non trouvé : {gpkg_path}")
        sys.exit(1)

    convert_bdtopo(gpkg_path, dept_code, output_dir)
    print("Terminé !")


if __name__ == "__main__":
    main()
