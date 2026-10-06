# -*- mode: python ; coding: utf-8 -*-
# Especificación de PyInstaller. Se ejecuta desde la carpeta facturacion/:
#   pyinstaller empaquetado/facturador.spec
import os

raiz = os.path.abspath(os.path.join(SPECPATH, ".."))

a = Analysis(
    [os.path.join(raiz, "facturacion.py")],
    pathex=[raiz],
    binaries=[],
    datas=[(os.path.join(raiz, "facturador", "static"), os.path.join("facturador", "static"))],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "unittest", "test", "pydoc", "doctest"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="FacturadorAA",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,           # ventana de consola: muestra la URL y permite cerrar con Ctrl+C
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
