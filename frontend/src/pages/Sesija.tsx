import React from "react";
import { TableBlock } from "../components/runtime/TableBlock";

const Sesija: React.FC = () => {
  return (
    <div id="page-sesija-2">
    <div id="ig9yj" style={{"display": "flex", "height": "100vh", "fontFamily": "Arial, sans-serif", "--chart-color-palette": "default"}}>
      <nav id="iw9jn" style={{"width": "250px", "background": "linear-gradient(135deg, #4b3c82 0%, #5a3d91 100%)", "color": "white", "padding": "20px", "overflowY": "auto", "display": "flex", "flexDirection": "column", "--chart-color-palette": "default"}}>
        <h2 id="ioqtg" style={{"marginTop": "0", "fontSize": "24px", "marginBottom": "30px", "fontWeight": "bold", "--chart-color-palette": "default"}}>{"BESSER"}</h2>
        <div id="ipanm" style={{"display": "flex", "flexDirection": "column", "flex": "1", "--chart-color-palette": "default"}}>
          <a id="itzqk" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/klijent">{"Klijent"}</a>
          <a id="itooe" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/grupa">{"Grupa"}</a>
          <a id="iva0o" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "rgba(255,255,255,0.2)", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/sesija">{"Sesija"}</a>
          <a id="i3adl" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/sesijaklijent">{"SesijaKlijent"}</a>
          <a id="i7w1t" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/sesijagrupa">{"SesijaGrupa"}</a>
          <a id="iyd6j" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/cena">{"Cena"}</a>
        </div>
        <p id="ivpks" style={{"marginTop": "auto", "paddingTop": "20px", "borderTop": "1px solid rgba(255,255,255,0.2)", "fontSize": "11px", "opacity": "0.8", "textAlign": "center", "--chart-color-palette": "default"}}>{"© 2026 BESSER. All rights reserved."}</p>
      </nav>
      <main id="i2t4k" style={{"flex": "1", "padding": "40px", "overflowY": "auto", "background": "#f5f5f5", "--chart-color-palette": "default"}}>
        <h1 id="i3bs4" style={{"marginTop": "0", "color": "#333", "fontSize": "32px", "marginBottom": "10px", "--chart-color-palette": "default"}}>{"Sesija"}</h1>
        <p id="iqch2n" style={{"color": "#666", "marginBottom": "30px", "--chart-color-palette": "default"}}>{"Manage Sesija data"}</p>
        <TableBlock id="table-sesija-2" styles={{"width": "100%", "minHeight": "400px", "--chart-color-palette": "default"}} title="Sesija List" options={{"showHeader": true, "stripedRows": false, "showPagination": true, "rowsPerPage": 5, "actionButtons": true, "columns": [{"label": "Id", "column_type": "field", "field": "id", "type": "int", "required": true}, {"label": "Pocetak", "column_type": "field", "field": "pocetak", "type": "datetime", "required": true}, {"label": "Kraj", "column_type": "field", "field": "kraj", "type": "datetime", "required": true}, {"label": "Cena", "column_type": "field", "field": "cena", "type": "float", "required": true}, {"label": "Status", "column_type": "field", "field": "status", "type": "str", "required": true}], "formColumns": [{"column_type": "field", "field": "id", "label": "id", "type": "int", "required": true, "defaultValue": null}, {"column_type": "field", "field": "pocetak", "label": "pocetak", "type": "datetime", "required": true, "defaultValue": null}, {"column_type": "field", "field": "kraj", "label": "kraj", "type": "datetime", "required": true, "defaultValue": null}, {"column_type": "field", "field": "cena", "label": "cena", "type": "float", "required": true, "defaultValue": null}, {"column_type": "field", "field": "status", "label": "status", "type": "str", "required": true, "defaultValue": null}, {"column_type": "lookup", "path": "sesijaklijent_1", "field": "sesijaklijent_1", "lookup_field": "id", "entity": "SesijaKlijent", "type": "list", "required": false}, {"column_type": "lookup", "path": "sesijagrupa_1", "field": "sesijagrupa_1", "lookup_field": "id", "entity": "SesijaGrupa", "type": "list", "required": false}, {"column_type": "lookup", "path": "cena", "field": "cena", "lookup_field": "id", "entity": "Cena", "type": "list", "required": false}]}} dataBinding={{"entity": "Sesija", "endpoint": "/sesija/"}} />
      </main>
    </div>    </div>
  );
};

export default Sesija;
