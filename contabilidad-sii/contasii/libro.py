"""Núcleo contable: asientos en partida doble, Diario, Mayor y Balance.

Todos los montos se manejan en pesos enteros (int), sin decimales.
"""

import hashlib
import json
import os
from dataclasses import dataclass, field
from datetime import date

from . import db, rut as rutmod

DATOS = os.path.join(os.path.dirname(__file__), "datos")
REGIMENES = {
    "14A": "Régimen general semi integrado (art. 14 letra A LIR)",
    "14D3": "Régimen Pro Pyme general (art. 14 letra D N°3 LIR)",
    "14D8": "Régimen Pro Pyme transparente (art. 14 letra D N°8 LIR)",
    "PN_HONORARIOS": "Persona natural con rentas del art. 42 N°2 LIR (honorarios)",
}


class ErrorContable(Exception):
    pass


@dataclass
class Linea:
    cuenta: str
    debe: int = 0
    haber: int = 0
    detalle: str = ""
    rut_aux: str = ""
    documento: int | None = None


@dataclass
class Asiento:
    fecha: str
    glosa: str
    lineas: list = field(default_factory=list)
    tipo: str = "traspaso"
    origen: str = "manual"
    anula_a: int | None = None

    def cargar(self, cuenta, monto, **kw):
        if monto:
            self.lineas.append(Linea(cuenta, debe=int(monto), **kw))
        return self

    def abonar(self, cuenta, monto, **kw):
        if monto:
            self.lineas.append(Linea(cuenta, haber=int(monto), **kw))
        return self


def periodo_de(fecha: str) -> str:
    date.fromisoformat(fecha)  # valida formato AAAA-MM-DD
    return fecha[:7]


class Libro:
    """Libro contable de un contribuyente, persistido en un archivo SQLite."""

    def __init__(self, ruta_db: str):
        self.ruta = ruta_db
        self.con = db.conectar(ruta_db)
        with open(os.path.join(DATOS, "plan_cuentas.json"), encoding="utf-8") as f:
            self._plan = json.load(f)

    # ------------------------------------------------------------ alta
    def inicializar(self, rut: str, razon_social: str, tipo: str, regimen: str, giro: str = ""):
        if regimen not in REGIMENES:
            raise ErrorContable(f"Régimen desconocido {regimen!r}. Opciones: {', '.join(REGIMENES)}")
        if self.contribuyente():
            raise ErrorContable("La base ya está inicializada.")
        with self.con:
            self.con.execute(
                "INSERT INTO contribuyente (id, rut, razon_social, tipo, regimen, giro) VALUES (1,?,?,?,?,?)",
                (rutmod.normalizar(rut), razon_social, tipo, regimen, giro),
            )
            self.con.executemany(
                "INSERT OR IGNORE INTO cuenta (codigo, nombre, tipo, imputable) VALUES (?,?,?,?)",
                self._plan["cuentas"],
            )
            db.registrar_bitacora(self.con, "inicializar", f"{rut} {razon_social} {regimen}")

    def contribuyente(self):
        return self.con.execute("SELECT * FROM contribuyente WHERE id=1").fetchone()

    def cuenta_auto(self, clave: str) -> str:
        return self._plan["automaticas"][clave]

    def agregar_cuenta(self, codigo, nombre, tipo, imputable=True):
        with self.con:
            self.con.execute(
                "INSERT INTO cuenta (codigo, nombre, tipo, imputable) VALUES (?,?,?,?)",
                (codigo, nombre, tipo, int(imputable)),
            )
            db.registrar_bitacora(self.con, "agregar_cuenta", f"{codigo} {nombre}")

    def cuentas(self):
        return self.con.execute("SELECT * FROM cuenta ORDER BY codigo").fetchall()

    # ------------------------------------------------------------ períodos
    def periodo_cerrado(self, periodo: str) -> bool:
        r = self.con.execute("SELECT cerrado FROM periodo WHERE periodo=?", (periodo,)).fetchone()
        return bool(r and r["cerrado"])

    def cerrar_periodo(self, periodo: str):
        problemas = [p for p in self.verificar_integridad() if p]
        if problemas:
            raise ErrorContable("No se puede cerrar: " + "; ".join(problemas))
        with self.con:
            self.con.execute(
                "INSERT INTO periodo (periodo, cerrado, cerrado_en) VALUES (?,1,datetime('now')) "
                "ON CONFLICT(periodo) DO UPDATE SET cerrado=1, cerrado_en=datetime('now')",
                (periodo,),
            )
            db.registrar_bitacora(self.con, "cerrar_periodo", periodo)

    # ------------------------------------------------------------ asientos
    def _validar(self, a: Asiento):
        if not a.glosa.strip():
            raise ErrorContable("El asiento debe tener glosa.")
        if len(a.lineas) < 2:
            raise ErrorContable("El asiento debe tener al menos dos líneas.")
        periodo = periodo_de(a.fecha)
        if self.periodo_cerrado(periodo):
            raise ErrorContable(f"El período {periodo} está cerrado.")
        debe = haber = 0
        for ln in a.lineas:
            c = self.con.execute("SELECT * FROM cuenta WHERE codigo=?", (ln.cuenta,)).fetchone()
            if not c:
                raise ErrorContable(f"Cuenta inexistente: {ln.cuenta}")
            if not c["imputable"] or not c["activa"]:
                raise ErrorContable(f"La cuenta {ln.cuenta} no es imputable o está inactiva.")
            if ln.debe < 0 or ln.haber < 0 or (ln.debe and ln.haber) or not (ln.debe or ln.haber):
                raise ErrorContable(f"Línea inválida en cuenta {ln.cuenta}: use debe o haber positivo.")
            if ln.rut_aux:
                ln.rut_aux = rutmod.normalizar(ln.rut_aux)
            debe += ln.debe
            haber += ln.haber
        if debe != haber:
            raise ErrorContable(f"Asiento descuadrado: debe {debe} ≠ haber {haber}.")
        return periodo

    @staticmethod
    def _hash(prev: str, numero: int, a: Asiento) -> str:
        carga = json.dumps(
            [prev, numero, a.fecha, a.glosa, a.tipo, a.origen, a.anula_a,
             [[l.cuenta, l.debe, l.haber, l.detalle, l.rut_aux, l.documento] for l in a.lineas]],
            ensure_ascii=False, sort_keys=True,
        )
        return hashlib.sha256(carga.encode("utf-8")).hexdigest()

    def registrar(self, a: Asiento, _transaccion=True) -> int:
        """Valida y registra un asiento. Devuelve su número correlativo."""
        periodo = self._validar(a)
        ult = self.con.execute("SELECT numero, hash FROM asiento ORDER BY numero DESC LIMIT 1").fetchone()
        numero = (ult["numero"] + 1) if ult else 1
        prev = ult["hash"] if ult else "0" * 64
        h = self._hash(prev, numero, a)

        def _insertar():
            self.con.execute(
                "INSERT INTO asiento (numero, fecha, periodo, glosa, tipo, origen, anula_a, hash, hash_prev) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (numero, a.fecha, periodo, a.glosa, a.tipo, a.origen, a.anula_a, h, prev),
            )
            self.con.executemany(
                "INSERT INTO linea (asiento, cuenta, debe, haber, detalle, rut_aux, documento) VALUES (?,?,?,?,?,?,?)",
                [(numero, l.cuenta, l.debe, l.haber, l.detalle, l.rut_aux, l.documento) for l in a.lineas],
            )

        if _transaccion:
            with self.con:
                _insertar()
        else:
            _insertar()
        return numero

    def anular(self, numero: int, fecha: str, motivo: str) -> int:
        """Anula un asiento mediante contra-asiento (nunca se borra)."""
        orig = self.con.execute("SELECT * FROM asiento WHERE numero=?", (numero,)).fetchone()
        if not orig:
            raise ErrorContable(f"No existe el asiento {numero}.")
        if self.con.execute("SELECT 1 FROM asiento WHERE anula_a=?", (numero,)).fetchone():
            raise ErrorContable(f"El asiento {numero} ya fue anulado.")
        a = Asiento(fecha, f"Anula asiento N°{numero}: {motivo}", tipo="anulacion", origen="manual", anula_a=numero)
        for l in self.lineas_de(numero):
            a.lineas.append(Linea(l["cuenta"], debe=l["haber"], haber=l["debe"],
                                  detalle=l["detalle"] or "", rut_aux=l["rut_aux"] or "", documento=l["documento"]))
        n = self.registrar(a)
        with self.con:
            db.registrar_bitacora(self.con, "anular", f"{numero} -> {n}: {motivo}")
        return n

    def lineas_de(self, numero: int):
        return self.con.execute("SELECT * FROM linea WHERE asiento=? ORDER BY id", (numero,)).fetchall()

    # ------------------------------------------------------------ libros
    def libro_diario(self, desde: str = "0000-00-00", hasta: str = "9999-12-31"):
        """Lista de asientos con sus líneas, en orden correlativo."""
        out = []
        for a in self.con.execute(
            "SELECT * FROM asiento WHERE fecha BETWEEN ? AND ? ORDER BY numero", (desde, hasta)
        ):
            lineas = self.con.execute(
                "SELECT l.*, c.nombre FROM linea l JOIN cuenta c ON c.codigo=l.cuenta WHERE asiento=? ORDER BY l.id",
                (a["numero"],),
            ).fetchall()
            out.append((a, lineas))
        return out

    def libro_mayor(self, cuenta: str, desde: str = "0000-00-00", hasta: str = "9999-12-31"):
        """Movimientos de una cuenta con saldo acumulado (saldo inicial = movimientos anteriores a 'desde')."""
        ini = self.con.execute(
            "SELECT COALESCE(SUM(l.debe - l.haber),0) s FROM linea l JOIN asiento a ON a.numero=l.asiento "
            "WHERE l.cuenta=? AND a.fecha < ?", (cuenta, desde)).fetchone()["s"]
        saldo, filas = ini, []
        for r in self.con.execute(
            "SELECT a.numero, a.fecha, a.glosa, l.debe, l.haber, l.detalle, l.rut_aux FROM linea l "
            "JOIN asiento a ON a.numero=l.asiento WHERE l.cuenta=? AND a.fecha BETWEEN ? AND ? "
            "ORDER BY a.fecha, a.numero, l.id", (cuenta, desde, hasta)):
            saldo += r["debe"] - r["haber"]
            filas.append({**dict(r), "saldo": saldo})
        return ini, filas

    def saldos(self, hasta: str = "9999-12-31", desde: str = "0000-00-00"):
        return self.con.execute(
            "SELECT c.codigo, c.nombre, c.tipo, COALESCE(SUM(l.debe),0) debe, COALESCE(SUM(l.haber),0) haber "
            "FROM cuenta c JOIN linea l ON l.cuenta=c.codigo JOIN asiento a ON a.numero=l.asiento "
            "WHERE a.fecha BETWEEN ? AND ? GROUP BY c.codigo ORDER BY c.codigo", (desde, hasta)).fetchall()

    def balance_8_columnas(self, hasta: str = "9999-12-31", desde: str = "0000-00-00"):
        """Balance tributario de 8 columnas: Sumas, Saldos, Inventario y Resultados."""
        filas, tot = [], [0] * 8
        for r in self.saldos(hasta, desde):
            d, h = r["debe"], r["haber"]
            deudor, acreedor = max(d - h, 0), max(h - d, 0)
            activo = pasivo = perdida = ganancia = 0
            if r["tipo"] in ("activo", "pasivo", "patrimonio", "orden"):
                activo, pasivo = deudor, acreedor
            else:
                perdida, ganancia = deudor, acreedor
            fila = [d, h, deudor, acreedor, activo, pasivo, perdida, ganancia]
            tot = [x + y for x, y in zip(tot, fila)]
            filas.append((r["codigo"], r["nombre"], fila))
        resultado = tot[7] - tot[6]  # utilidad (+) o pérdida (-)
        return filas, tot, resultado

    def estado_resultados(self, desde: str, hasta: str):
        ingresos = gastos = 0
        detalle = []
        for r in self.saldos(hasta, desde):
            if r["tipo"] == "ingreso":
                v = r["haber"] - r["debe"]
                ingresos += v
            elif r["tipo"] == "gasto":
                v = r["debe"] - r["haber"]
                gastos += v
            else:
                continue
            detalle.append((r["codigo"], r["nombre"], r["tipo"], v))
        return detalle, ingresos, gastos, ingresos - gastos

    # ------------------------------------------------------------ integridad
    def verificar_integridad(self):
        """Recalcula la cadena de hashes y la cuadratura de cada asiento. Devuelve lista de problemas."""
        problemas, prev = [], "0" * 64
        esperado = 1
        for a in self.con.execute("SELECT * FROM asiento ORDER BY numero"):
            if a["numero"] != esperado:
                problemas.append(f"Salto en la numeración: se esperaba {esperado} y hay {a['numero']}")
                esperado = a["numero"]
            esperado += 1
            ls = self.lineas_de(a["numero"])
            asi = Asiento(a["fecha"], a["glosa"], tipo=a["tipo"], origen=a["origen"], anula_a=a["anula_a"],
                          lineas=[Linea(l["cuenta"], l["debe"], l["haber"], l["detalle"] or "",
                                        l["rut_aux"] or "", l["documento"]) for l in ls])
            if sum(l.debe for l in asi.lineas) != sum(l.haber for l in asi.lineas):
                problemas.append(f"Asiento {a['numero']} descuadrado")
            if a["hash_prev"] != prev or self._hash(prev, a["numero"], asi) != a["hash"]:
                problemas.append(f"Asiento {a['numero']}: hash no coincide (posible alteración)")
            prev = a["hash"]
        return problemas
