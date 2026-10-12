# Carrusel @choapajusta: ofertas de trabajo falsas

Diez slides de 1080×1350 en `slides/`, generadas con el skill
`carrusel-juridico-choapajusta`. Los textos para Instagram y Facebook están en
`ofertas-trabajo-falsas_captions.md`.

**Estado: BORRADOR — NO PUBLICAR.** Todas las slides llevan la banda roja
porque quedan dos citas sin cotejar en fuente oficial (LeyChile no se pudo
abrir desde el entorno donde se generaron):

- Art. 468 del Código Penal (slide 7 y cierre). El texto de la slide es una
  paráfrasis de la redacción que recogen fuentes secundarias. Según esas mismas
  fuentes, la Ley 21.595 agregó incisos a ese artículo.
- Art. 173 del Código Procesal Penal (cierre): denuncia ante Carabineros, PDI
  o Fiscalía.

## Para publicar

1. Coteja ambos artículos en LeyChile.
2. Quita los `[VERIFICAR…]` de `spec.json` y de los captions.
3. Vuelve a generar las slides:

   ```bash
   python3 <ruta-al-skill>/scripts/generar_carrusel.py spec.json slides/
   ```

El aviso se describe con palabras ("un anuncio que usa el nombre de Mercado
Libre") y no se reproduce la imagen ni el logo. Se habla de "señales típicas
de estafa" y no se afirma quién lo publicó.
