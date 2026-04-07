import React from "react";
import { TableBlock } from "../components/runtime/TableBlock";

const Klijent: React.FC = () => {
  return (
    <div id="page-klijent-0">
    <div id="imwdv" style={{"height": "100vh", "fontFamily": "Arial, sans-serif", "display": "flex", "--chart-color-palette": "default"}}>
      <nav id="idagk" style={{"width": "250px", "padding": "20px", "display": "flex", "overflowY": "auto", "background": "linear-gradient(135deg, #4b3c82 0%, #5a3d91 100%)", "color": "white", "--chart-color-palette": "default", "flexDirection": "column"}}>
        <h2 id="i2df3" style={{"fontSize": "24px", "fontWeight": "bold", "marginTop": "0", "marginBottom": "30px", "--chart-color-palette": "default"}}>{"BESSER"}</h2>
        <div id="i4d9f" style={{"display": "flex", "--chart-color-palette": "default", "flexDirection": "column", "flex": "1"}}>
          <a id="iy6ud" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "rgba(255,255,255,0.2)", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/klijent">{"Klijent"}</a>
          <a id="i0r8i" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/grupa">{"Grupa"}</a>
          <a id="ig0qz" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/sesija">{"Sesija"}</a>
          <a id="iuyel" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/sesijaklijent">{"SesijaKlijent"}</a>
          <a id="ilxl5" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/sesijagrupa">{"SesijaGrupa"}</a>
          <a id="imuuh" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/cena">{"Cena"}</a>
        </div>
        <p id="idnlv" style={{"fontSize": "11px", "paddingTop": "20px", "marginTop": "auto", "textAlign": "center", "opacity": "0.8", "borderTop": "1px solid rgba(255,255,255,0.2)", "--chart-color-palette": "default"}}>{"© 2026 BESSER. All rights reserved."}</p>
      </nav>
      <main id="i7uqh" style={{"padding": "40px", "overflowY": "auto", "background": "#f5f5f5", "--chart-color-palette": "default", "flex": "1"}}>
        <h1 id="ip5s4" style={{"fontSize": "32px", "marginTop": "0", "marginBottom": "10px", "color": "#333", "--chart-color-palette": "default"}}>{"Klijent"}</h1>
        <p id="i7486" style={{"marginBottom": "30px", "color": "#666", "--chart-color-palette": "default"}}>{"Manage Klijent data"}</p>
        <TableBlock id="table-klijent-0" styles={{"width": "100%", "minHeight": "400px", "--chart-color-palette": "default"}} title="Klijent List" options={{"showHeader": true, "stripedRows": false, "showPagination": true, "rowsPerPage": 5, "actionButtons": true, "columns": [{"label": "Id", "column_type": "field", "field": "id", "type": "int", "required": true}, {"label": "Ime", "column_type": "field", "field": "ime", "type": "str", "required": true}, {"label": "Prezime", "column_type": "field", "field": "prezime", "type": "str", "required": true}, {"label": "Broj Telefona", "column_type": "field", "field": "broj_telefona", "type": "str", "required": true}, {"label": "Email", "column_type": "field", "field": "email", "type": "str", "required": true}], "formColumns": [{"column_type": "field", "field": "broj_telefona", "label": "broj_telefona", "type": "str", "required": true, "defaultValue": null}, {"column_type": "field", "field": "email", "label": "email", "type": "str", "required": true, "defaultValue": null}, {"column_type": "field", "field": "id", "label": "id", "type": "int", "required": true, "defaultValue": null}, {"column_type": "field", "field": "ime", "label": "ime", "type": "str", "required": true, "defaultValue": null}, {"column_type": "field", "field": "prezime", "label": "prezime", "type": "str", "required": true, "defaultValue": null}, {"column_type": "lookup", "path": "cena_1", "field": "cena_1", "lookup_field": "id", "entity": "Cena", "type": "list", "required": false}, {"column_type": "lookup", "path": "sesijaklijent", "field": "sesijaklijent", "lookup_field": "id", "entity": "SesijaKlijent", "type": "list", "required": false}]}} dataBinding={{"entity": "Klijent", "endpoint": "/klijent/"}} />
      </main>
    </div>    </div>
  );
};

export default Klijent;
