import React from "react";
import { TableBlock } from "../components/runtime/TableBlock";

const Cena: React.FC = () => {
  return (
    <div id="page-cena-5">
    <div id="ix5dvb" style={{"height": "100vh", "fontFamily": "Arial, sans-serif", "display": "flex", "--chart-color-palette": "default"}}>
      <nav id="irp4tv" style={{"width": "250px", "padding": "20px", "display": "flex", "overflowY": "auto", "background": "linear-gradient(135deg, #4b3c82 0%, #5a3d91 100%)", "color": "white", "--chart-color-palette": "default", "flexDirection": "column"}}>
        <h2 id="izc3d6" style={{"fontSize": "24px", "fontWeight": "bold", "marginTop": "0", "marginBottom": "30px", "--chart-color-palette": "default"}}>{"BESSER"}</h2>
        <div id="izwul2" style={{"display": "flex", "--chart-color-palette": "default", "flexDirection": "column", "flex": "1"}}>
          <a id="i4o70n" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/klijent">{"Klijent"}</a>
          <a id="ig0ejq" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/grupa">{"Grupa"}</a>
          <a id="imvg9e" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/sesija">{"Sesija"}</a>
          <a id="izu2d7" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/sesijaklijent">{"SesijaKlijent"}</a>
          <a id="ipo0dy" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/sesijagrupa">{"SesijaGrupa"}</a>
          <a id="i4yo8o" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "rgba(255,255,255,0.2)", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/cena">{"Cena"}</a>
        </div>
        <p id="iulktt" style={{"fontSize": "11px", "paddingTop": "20px", "marginTop": "auto", "textAlign": "center", "opacity": "0.8", "borderTop": "1px solid rgba(255,255,255,0.2)", "--chart-color-palette": "default"}}>{"© 2026 BESSER. All rights reserved."}</p>
      </nav>
      <main id="ih08yj" style={{"padding": "40px", "overflowY": "auto", "background": "#f5f5f5", "--chart-color-palette": "default", "flex": "1"}}>
        <h1 id="i9y001" style={{"fontSize": "32px", "marginTop": "0", "marginBottom": "10px", "color": "#333", "--chart-color-palette": "default"}}>{"Cena"}</h1>
        <p id="in2bd7" style={{"marginBottom": "30px", "color": "#666", "--chart-color-palette": "default"}}>{"Manage Cena data"}</p>
        <TableBlock id="table-cena-5" styles={{"width": "100%", "minHeight": "400px", "--chart-color-palette": "default"}} title="Cena List" options={{"showHeader": true, "stripedRows": false, "showPagination": true, "rowsPerPage": 5, "actionButtons": true, "columns": [{"label": "Id", "column_type": "field", "field": "id", "type": "int", "required": true}, {"label": "Cena", "column_type": "field", "field": "cena", "type": "float", "required": true}, {"label": "Datum Uplate", "column_type": "field", "field": "datum_uplate", "type": "date", "required": true}, {"label": "Nacin Placanja", "column_type": "field", "field": "nacin_placanja", "type": "str", "required": true}, {"label": "Status", "column_type": "field", "field": "status", "type": "str", "required": true}], "formColumns": [{"column_type": "field", "field": "id", "label": "id", "type": "int", "required": true, "defaultValue": null}, {"column_type": "field", "field": "cena", "label": "cena", "type": "float", "required": true, "defaultValue": null}, {"column_type": "field", "field": "datum_uplate", "label": "datum_uplate", "type": "date", "required": true, "defaultValue": null}, {"column_type": "field", "field": "nacin_placanja", "label": "nacin_placanja", "type": "str", "required": true, "defaultValue": null}, {"column_type": "field", "field": "status", "label": "status", "type": "str", "required": true, "defaultValue": null}, {"column_type": "lookup", "path": "sesija_2", "field": "sesija_2", "lookup_field": "id", "entity": "Sesija", "type": "str", "required": true}, {"column_type": "lookup", "path": "klijent_1", "field": "klijent_1", "lookup_field": "broj_telefona", "entity": "Klijent", "type": "str", "required": true}]}} dataBinding={{"entity": "Cena", "endpoint": "/cena/"}} />
      </main>
    </div>    </div>
  );
};

export default Cena;
