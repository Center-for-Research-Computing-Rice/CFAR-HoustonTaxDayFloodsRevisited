/**
 * Run: `node --test js/homes/depthWhereClause.test.mjs`
 * Ensures centroid counts use the same depth / gain semantics as flood rasters.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MIN_HOME_FLOOD_DEPTH_FT, buildCentroidDepthWhereSql } from "./depthAndCount.js";

const wdef = {
    historicField: "TD_histori",
    transportedField: "TD_transpo"
};

test("historic: any depth uses minimum flooded-home floor on historic field", () => {
    const sql = buildCentroidDepthWhereSql({ floodLayer: "historic", wdef, minDepthFt: 0 });
    assert.equal(sql, `TD_histori >= ${MIN_HOME_FLOOD_DEPTH_FT} AND TD_histori <> -9999`);
});

test("historic: slider 1.2 ft filters historic depth", () => {
    const sql = buildCentroidDepthWhereSql({ floodLayer: "historic", wdef, minDepthFt: 1.2 });
    assert.equal(sql, "TD_histori >= 1.2 AND TD_histori <> -9999");
});

test("transported: same pattern on transported field", () => {
    assert.equal(
        buildCentroidDepthWhereSql({ floodLayer: "transported", wdef, minDepthFt: 0 }),
        `TD_transpo >= ${MIN_HOME_FLOOD_DEPTH_FT} AND TD_transpo <> -9999`
    );
    assert.equal(
        buildCentroidDepthWhereSql({ floodLayer: "transported", wdef, minDepthFt: 2 }),
        "TD_transpo >= 2 AND TD_transpo <> -9999"
    );
});

test("difference: any depth uses positive gain (matches difference raster)", () => {
    const sql = buildCentroidDepthWhereSql({ floodLayer: "difference", wdef, minDepthFt: 0 });
    assert.match(sql, /\(TD_transpo > TD_histori\)/);
    assert.match(sql, /TD_histori <= 0 OR TD_histori = -9999/);
});

test("difference: slider filters depth gain, not transported depth alone", () => {
    const sql = buildCentroidDepthWhereSql({ floodLayer: "difference", wdef, minDepthFt: 1 });
    assert.equal(
        sql,
        "(TD_histori <= 0 OR TD_histori = -9999) AND TD_transpo <> -9999 AND (TD_transpo >= (TD_histori + 1))"
    );
});

test("difference: 1.2 ft threshold on gain", () => {
    const sql = buildCentroidDepthWhereSql({ floodLayer: "difference", wdef, minDepthFt: 1.2 });
    assert.ok(sql.includes("(TD_transpo >= (TD_histori + 1.2))"));
});
