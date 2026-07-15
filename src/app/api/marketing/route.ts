import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

// ─── Tablas Loyalty MinisoLove (MX) ───────────────────────────────────────────
// loy_clientes_registrados     → base + nuevos registros
// loy_customers_transactions   → venta loyalty del período
// loy_ganados_pos/ecommerce/appminiso → puntos ganados por canal
// loy_redimidos_descuento_pos/appminiso/xgiftcard_ecommerce → redimidos
//
// Columnas (Diccionario_Datos_Tecnico_v5.2):
//   loy_clientes_registrados  : id_crm, fechacreacion, puntosdisponiblesactuales
//   loy_customers_transactions: ventasinimpuesto, piezas, transaction_date, tipotransaccion, customer_id
//   loy_ganados_* / loy_redimidos_*: fecha, id_crm, puntos_posteados, monto_puntos

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year  = parseInt(searchParams.get("year")  || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));

  try {
    const [
      rowsNuevos,
      rowsTotalBase,
      rowsTransacciones,
      rowsGanadosPOS,
      rowsGanadosEcom,
      rowsGanadosApp,
      rowsRedimidosPOS,
      rowsRedimidosApp,
      rowsRedimidosGift,
    ] = await Promise.all([

      // 1. Registros nuevos del mes
      query(`
        SELECT COUNT(DISTINCT id_crm) AS nuevos_mes
        FROM miniso_dlh.analytics_mx_prod.loy_clientes_registrados
        WHERE EXTRACT(YEAR  FROM fechacreacion)::INTEGER = $1
          AND EXTRACT(MONTH FROM fechacreacion)::INTEGER = $2
      `, [year, month]),

      // 2. Base total acumulada
      query(`
        SELECT COUNT(DISTINCT id_crm) AS total_base
        FROM miniso_dlh.analytics_mx_prod.loy_clientes_registrados
      `, []),

      // 3. Transacciones loyalty (solo ventas, no devoluciones)
      query(`
        SELECT
          COUNT(DISTINCT id_crm)               AS clientes_activos,
          COALESCE(SUM(ventasinimpuesto), 0)   AS venta_loyalty,
          COUNT(*)                              AS transacciones,
          COALESCE(SUM(piezas), 0)             AS piezas
        FROM miniso_dlh.analytics_mx_prod.loy_customers_transactions
        WHERE EXTRACT(YEAR  FROM transaction_date)::INTEGER = $1
          AND EXTRACT(MONTH FROM transaction_date)::INTEGER = $2
          AND tipotransaccion = 'Venta'
      `, [year, month]),

      // 4. Puntos ganados POS
      query(`
        SELECT
          COALESCE(SUM(puntos_posteados), 0) AS puntos,
          COALESCE(SUM(monto_puntos), 0)      AS monto,
          COUNT(DISTINCT id_crm)              AS clientes
        FROM miniso_dlh.analytics_mx_prod.loy_ganados_pos
        WHERE EXTRACT(YEAR  FROM fecha)::INTEGER = $1
          AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
      `, [year, month]),

      // 5. Puntos ganados E-commerce
      query(`
        SELECT
          COALESCE(SUM(puntos_posteados), 0) AS puntos,
          COALESCE(SUM(monto_puntos), 0)      AS monto
        FROM miniso_dlh.analytics_mx_prod.loy_ganados_ecommerce
        WHERE EXTRACT(YEAR  FROM fecha)::INTEGER = $1
          AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
      `, [year, month]),

      // 6. Puntos ganados App Miniso
      query(`
        SELECT
          COALESCE(SUM(puntos_posteados), 0) AS puntos,
          COALESCE(SUM(monto_puntos), 0)      AS monto
        FROM miniso_dlh.analytics_mx_prod.loy_ganados_appminiso
        WHERE EXTRACT(YEAR  FROM fecha)::INTEGER = $1
          AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
      `, [year, month]),

      // 7. Redimidos descuento POS
      query(`
        SELECT
          ABS(COALESCE(SUM(puntos_posteados), 0)) AS puntos,
          ABS(COALESCE(SUM(monto_puntos), 0))      AS monto,
          COUNT(DISTINCT id_crm)                   AS clientes
        FROM miniso_dlh.analytics_mx_prod.loy_redimidos_descuento_pos
        WHERE EXTRACT(YEAR  FROM fecha)::INTEGER = $1
          AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
      `, [year, month]),

      // 8. Redimidos App
      query(`
        SELECT
          ABS(COALESCE(SUM(puntos_posteados), 0)) AS puntos,
          ABS(COALESCE(SUM(monto_puntos), 0))      AS monto
        FROM miniso_dlh.analytics_mx_prod.loy_redimidos_appminiso
        WHERE EXTRACT(YEAR  FROM fecha)::INTEGER = $1
          AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
      `, [year, month]),

      // 9. Redimidos GiftCard E-commerce
      query(`
        SELECT
          ABS(COALESCE(SUM(puntos_posteados), 0)) AS puntos,
          ABS(COALESCE(SUM(monto_puntos), 0))      AS monto
        FROM miniso_dlh.analytics_mx_prod.loy_redimidos_xgiftcard_ecommerce
        WHERE EXTRACT(YEAR  FROM fecha)::INTEGER = $1
          AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
      `, [year, month]),
    ]);

    const rNuevos = rowsNuevos[0]        ?? {};
    const rBase   = rowsTotalBase[0]     ?? {};
    const rTrx    = rowsTransacciones[0] ?? {};
    const rGPos   = rowsGanadosPOS[0]    ?? {};
    const rGEcom  = rowsGanadosEcom[0]   ?? {};
    const rGApp   = rowsGanadosApp[0]    ?? {};
    const rRPos   = rowsRedimidosPOS[0]  ?? {};
    const rRApp   = rowsRedimidosApp[0]  ?? {};
    const rRGift  = rowsRedimidosGift[0] ?? {};

    const ganados_total =
      Number(rGPos.puntos  || 0) +
      Number(rGEcom.puntos || 0) +
      Number(rGApp.puntos  || 0);

    const redimidos_total =
      Number(rRPos.puntos  || 0) +
      Number(rRApp.puntos  || 0) +
      Number(rRGift.puntos || 0);

    const monto_redimidos_total =
      Number(rRPos.monto  || 0) +
      Number(rRApp.monto  || 0) +
      Number(rRGift.monto || 0);

    return NextResponse.json({
      ok: true,
      year,
      month,
      data: {
        registros: {
          nuevos_mes: Number(rNuevos.nuevos_mes || 0),
          total_base: Number(rBase.total_base   || 0),
        },
        transacciones: {
          clientes_activos: Number(rTrx.clientes_activos || 0),
          venta_loyalty:    Number(rTrx.venta_loyalty    || 0),
          transacciones:    Number(rTrx.transacciones    || 0),
          piezas:           Number(rTrx.piezas           || 0),
        },
        puntos: {
          ganados_pos:   Number(rGPos.puntos   || 0),
          monto_pos:     Number(rGPos.monto    || 0),
          clientes_pos:  Number(rGPos.clientes || 0),
          ganados_ecom:  Number(rGEcom.puntos  || 0),
          monto_ecom:    Number(rGEcom.monto   || 0),
          ganados_app:   Number(rGApp.puntos   || 0),
          monto_app:     Number(rGApp.monto    || 0),
          ganados_total,
          redimidos_pos:        Number(rRPos.puntos   || 0),
          monto_red_pos:        Number(rRPos.monto    || 0),
          clientes_redim:       Number(rRPos.clientes || 0),
          redimidos_app:        Number(rRApp.puntos   || 0),
          monto_red_app:        Number(rRApp.monto    || 0),
          redimidos_gift:       Number(rRGift.puntos  || 0),
          monto_red_gift:       Number(rRGift.monto   || 0),
          redimidos_total,
          monto_redimidos_total,
        },
      },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
