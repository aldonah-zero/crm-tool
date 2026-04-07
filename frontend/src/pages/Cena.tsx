import React from "react";
import { TableBlock } from "../components/runtime/TableBlock";

const Cena: React.FC = () => {
  return (
    <div id="page-cena-5">
    <div id="ix5dvb" style={{"display": "flex", "height": "100vh", "fontFamily": "Arial, sans-serif", "--chart-color-palette": "default"}}>
      <nav id="irp4tv" style={{"width": "250px", "background": "linear-gradient(135deg, #4b3c82 0%, #5a3d91 100%)", "color": "white", "padding": "20px", "overflowY": "auto", "display": "flex", "flexDirection": "column", "--chart-color-palette": "default"}}>
        <h2 id="izc3d6" style={{"marginTop": "0", "fontSize": "24px", "marginBottom": "30px", "fontWeight": "bold", "--chart-color-palette": "default"}}>{"BESSER"}</h2>
        <div id="izwul2" style={{"display": "flex", "flexDirection": "column", "flex": "1", "--chart-color-palette": "default"}}>
          <a id="i4o70n" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/klijent">{"Klijent"}</a>
          <a id="ig0ejq" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/grupa">{"Grupa"}</a>
          <a id="imvg9e" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/sesija">{"Sesija"}</a>
          <a id="izu2d7" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/sesijaklijent">{"SesijaKlijent"}</a>
          <a id="ipo0dy" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/sesijagrupa">{"SesijaGrupa"}</a>
          <a id="i4yo8o" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "rgba(255,255,255,0.2)", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/cena">{"Cena"}</a>
        </div>
        <p id="iulktt" style={{"marginTop": "auto", "paddingTop": "20px", "borderTop": "1px solid rgba(255,255,255,0.2)", "fontSize": "11px", "opacity": "0.8", "textAlign": "center", "--chart-color-palette": "default"}}>{"© 2026 BESSER. All rights reserved."}</p>
      </nav>
      <main id="ih08yj" style={{"flex": "1", "padding": "40px", "overflowY": "auto", "background": "#f5f5f5", "--chart-color-palette": "default"}}>
        <h1 id="i9y001" style={{"marginTop": "0", "color": "#333", "fontSize": "32px", "marginBottom": "10px", "--chart-color-palette": "default"}}>{"Cena"}</h1>
        <p id="in2bd7" style={{"color": "#666", "marginBottom": "30px", "--chart-color-palette": "default"}}>{"Manage Cena data"}</p>
        <TableBlock id="table-cena-5" styles={{"width": "100%", "minHeight": "400px", "--chart-color-palette": "default"}} title="Cena List" options={{"showHeader": true, "stripedRows": false, "showPagination": true, "rowsPerPage": 5, "actionButtons": true, "columns": [{"label": "Id", "column_type": "field", "field": "id", "type": "int", "required": true}, {"label": "Cena", "column_type": "field", "field": "cena", "type": "float", "required": true}, {"label": "Datum Uplate", "column_type": "field", "field": "datum_uplate", "type": "date", "required": true}, {"label": "Nacin Placanja", "column_type": "field", "field": "nacin_placanja", "type": "str", "required": true}, {"label": "Status", "column_type": "field", "field": "status", "type": "str", "required": true}], "formColumns": [{"column_type": "field", "field": "id", "label": "id", "type": "int", "required": true, "defaultValue": null}, {"column_type": "field", "field": "cena", "label": "cena", "type": "float", "required": true, "defaultValue": null}, {"column_type": "field", "field": "datum_uplate", "label": "datum_uplate", "type": "date", "required": true, "defaultValue": null}, {"column_type": "field", "field": "nacin_placanja", "label": "nacin_placanja", "type": "str", "required": true, "defaultValue": null}, {"column_type": "field", "field": "status", "label": "status", "type": "str", "required": true, "defaultValue": null}, {"column_type": "lookup", "path": "sesija_2", "field": "sesija_2", "lookup_field": "id", "entity": "Sesija", "type": "str", "required": true}, {"column_type": "lookup", "path": "klijent_1", "field": "klijent_1", "lookup_field": "id", "entity": "Klijent", "type": "str", "required": true}]}} dataBinding={{"entity": "Cena", "endpoint": "/cena/"}} />
      </main>
    </div>    </div>
  );
};

export default Cena;
