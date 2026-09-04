import { useState, useRef } from 'react';
import { TKButton, Icon } from '../../components/UI.jsx';
import {
  EXTENSIONES, TAMANIO_MAXIMO, formatBytes, pesoTotal, validarTanda,
} from '../../lib/archivosDiseno.js';
import {
  subirArchivoDiseno, urlDeDescarga, eliminarArchivoDiseno, guardarArchivosPrivados,
} from '../../lib/almacenamiento.js';

// ─── Archivos de diseño ──────────────────────────────────────────────
// Respaldo interno de los .stl/.3mf de cada producto. Los binarios van a
// Firebase Storage y la metadata a products/{id}/privado/data, los dos
// admin-only. Nunca salen al catálogo público.
//
// Cada subida y cada borrado se persisten en el acto, sin esperar al
// "Guardar" del formulario: el binario ya está en Storage en ese momento, y
// si el usuario cancelara el form quedaría un archivo huérfano que después
// nadie ve ni puede borrar desde la UI.

const cajaStyle = {
  padding: 16, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4,
};

const filaStyle = {
  display: "grid", gridTemplateColumns: "1fr 90px 130px 84px",
  gap: 12, alignItems: "center", padding: "10px 0",
  borderBottom: "1px solid var(--line)", fontSize: 13,
};

const fechaCorta = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/**
 * @param {string}   productId  null en un producto que todavía no se guardó
 * @param {Array}    archivos   metadata ya persistida
 * @param {Function} onChange   avisa la lista nueva al formulario
 * @param {string}   coleccion  "products" o "personalizados"
 */
export function ArchivosDiseno({ productId, archivos = [], onChange, coleccion = "products" }) {
  const [subiendo, setSubiendo] = useState(null);   // {nombre, progreso}
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const inputRef = useRef(null);

  const persistir = async (lista) => {
    onChange?.(lista);
    await guardarArchivosPrivados(productId, lista, coleccion);
  };

  const elegir = async (e) => {
    const seleccionados = [...(e.target.files || [])];
    // El input se limpia ya para poder volver a elegir el mismo archivo.
    e.target.value = "";
    if (seleccionados.length === 0) return;

    setError(""); setAviso("");
    const { validos, errores } = validarTanda(seleccionados);
    if (errores.length > 0) setError(errores.join(" "));
    if (validos.length === 0) return;

    let lista = archivos;
    try {
      for (const file of validos) {
        setSubiendo({ nombre: file.name, progreso: 0 });
        const meta = await subirArchivoDiseno(
          productId, file, lista,
          (p) => setSubiendo({ nombre: file.name, progreso: p })
        );
        lista = [...lista, meta];
        await persistir(lista);
      }
      setAviso(`✓ ${validos.length} archivo(s) subido(s).`);
    } catch (err) {
      setError("No se pudo subir: " + err.message);
    } finally {
      setSubiendo(null);
    }
  };

  const descargar = async (a) => {
    setError("");
    try {
      // La URL se pide recién ahora, no está guardada: ver almacenamiento.js.
      const url = await urlDeDescarga(a.path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(`No se pudo descargar "${a.nombre}": ${err.message}`);
    }
  };

  const borrar = async (a) => {
    if (!confirm(
      `¿Eliminar "${a.nombre}"?\n\n` +
      `Se borra el archivo real de Firebase Storage. No se puede deshacer.`
    )) return;
    setError(""); setAviso("");
    try {
      await eliminarArchivoDiseno(a.path);
      await persistir(archivos.filter(x => x.path !== a.path));
      setAviso(`✓ "${a.nombre}" eliminado.`);
    } catch (err) {
      setError(`No se pudo eliminar "${a.nombre}": ${err.message}`);
    }
  };

  const total = pesoTotal(archivos);

  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 12, flexWrap: "wrap", marginBottom: 8,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
          textTransform: "uppercase", color: "var(--muted)",
        }}>
          Archivos de diseño
        </div>
        {archivos.length > 0 && (
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            {archivos.length} archivo{archivos.length !== 1 ? "s" : ""} · {formatBytes(total)} en total
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 12px" }}>
        Respaldo interno de los archivos de impresión. {EXTENSIONES.join(" o ")}, hasta{" "}
        {formatBytes(TAMANIO_MAXIMO)} cada uno. No se muestran nunca en el catálogo público.
      </p>

      <div style={cajaStyle}>
        {!productId ? (
          <div style={{ fontSize: 13, color: "var(--muted)", padding: "8px 0" }}>
            Guardá el producto primero. Los archivos se guardan en una carpeta con
            su ID, que todavía no existe.
          </div>
        ) : (
          <>
            {archivos.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  ...filaStyle, paddingTop: 0, fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: 1.5, color: "var(--muted)",
                }}>
                  <div>Archivo</div><div>Tamaño</div><div>Subido</div><div></div>
                </div>
                {archivos.map(a => (
                  <div key={a.path} style={filaStyle}>
                    <div style={{
                      fontWeight: 600, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }} title={a.nombre}>
                      {a.nombre}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{formatBytes(a.tamanio)}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{fechaCorta(a.subidoAt)}</div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => descargar(a)}
                        title="Descargar"
                        style={{
                          background: "none", border: "1px solid var(--line)", borderRadius: 4,
                          padding: "6px 8px", cursor: "pointer", color: "var(--text)",
                          display: "flex", alignItems: "center",
                        }}
                      >
                        <Icon.arrow size={14}/>
                      </button>
                      <button
                        onClick={() => borrar(a)}
                        title="Eliminar de Storage"
                        style={{
                          background: "none", border: "1px solid var(--line)", borderRadius: 4,
                          padding: "6px 8px", cursor: "pointer", color: "#c64138",
                          display: "flex", alignItems: "center",
                        }}
                      >
                        <Icon.trash size={14}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {subiendo ? (
              <div style={{ padding: "6px 0" }}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  fontSize: 12, marginBottom: 6,
                }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Subiendo {subiendo.nombre}...
                  </span>
                  <strong>{subiendo.progreso}%</strong>
                </div>
                <div style={{ height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    width: `${subiendo.progreso}%`, height: "100%",
                    background: "var(--accent)", transition: "width .2s",
                  }}/>
                </div>
              </div>
            ) : (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={EXTENSIONES.join(",")}
                  onChange={elegir}
                  style={{ display: "none" }}
                />
                <TKButton
                  variant="outline"
                  onClick={() => inputRef.current?.click()}
                  icon={<Icon.plus size={14}/>}
                >
                  Subir archivo
                </TKButton>
              </>
            )}
          </>
        )}
      </div>

      {error && (
        <div style={{
          marginTop: 10, padding: "10px 12px", borderRadius: 4,
          background: "#c6413815", color: "#c64138", fontSize: 12, lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}
      {aviso && !error && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#4a7a52", fontWeight: 600 }}>
          {aviso}
        </div>
      )}
    </div>
  );
}
