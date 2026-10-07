"""Envío de boletines por SMTP (biblioteca estándar).

Sirve cualquier cuenta de correo que permita SMTP, incluida una cuenta gratuita
de Gmail con "contraseña de aplicación". Variables de entorno:

    JURISBOT_SMTP_HOST       p. ej. smtp.gmail.com
    JURISBOT_SMTP_PUERTO     587 (STARTTLS, por defecto) o 465 (SSL)
    JURISBOT_SMTP_USUARIO    usuario de la cuenta
    JURISBOT_SMTP_CLAVE      contraseña o contraseña de aplicación
    JURISBOT_SMTP_REMITENTE  dirección que aparece como remitente (por defecto el usuario)
"""
from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage


def config_smtp() -> dict:
    c = {
        "host": os.environ.get("JURISBOT_SMTP_HOST", ""),
        "puerto": int(os.environ.get("JURISBOT_SMTP_PUERTO", "587")),
        "usuario": os.environ.get("JURISBOT_SMTP_USUARIO", ""),
        "clave": os.environ.get("JURISBOT_SMTP_CLAVE", ""),
    }
    c["remitente"] = os.environ.get("JURISBOT_SMTP_REMITENTE", c["usuario"])
    faltan = [k for k in ("host", "usuario", "clave") if not c[k]]
    if faltan:
        raise ValueError("Falta configurar el correo: " +
                         ", ".join(f"JURISBOT_SMTP_{k.upper()}" for k in faltan))
    return c


def enviar(destino: str, asunto: str, cuerpo: str, config: dict | None = None,
           smtp_cls=None) -> None:
    c = config or config_smtp()
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = c["remitente"], destino, asunto
    msg.set_content(cuerpo)
    if smtp_cls is None:
        smtp_cls = smtplib.SMTP_SSL if c["puerto"] == 465 else smtplib.SMTP
    with smtp_cls(c["host"], c["puerto"], timeout=60) as s:
        if c["puerto"] != 465:
            s.starttls()
        s.login(c["usuario"], c["clave"])
        s.send_message(msg)
