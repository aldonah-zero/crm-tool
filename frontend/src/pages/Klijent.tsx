import React from "react";
import { TableBlock } from "../components/runtime/TableBlock";

const Klijent: React.FC = () => {
  return (
    <div id="page-klijent-0">
    <div id="imwdv" style={{"display": "flex", "height": "100vh", "fontFamily": "Arial, sans-serif", "--chart-color-palette": "default"}}>
      <nav id="idagk" style={{"width": "250px", "background": "linear-gradient(135deg, #4b3c82 0%, #5a3d91 100%)", "color": "white", "padding": "20px", "overflowY": "auto", "display": "flex", "flexDirection": "column", "--chart-color-palette": "default"}}>
        <h2 id="i2df3" style={{"marginTop": "0", "fontSize": "24px", "marginBottom": "30px", "fontWeight": "bold", "--chart-color-palette": "default"}}>{"BESSER"}</h2>
        <div id="i4d9f" style={{"display": "flex", "flexDirection": "column", "flex": "1", "--chart-color-palette": "default"}}>
          <a id="iy6ud" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "rgba(255,255,255,0.2)", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/klijent">{"Klijent"}</a>
          <a id="i0r8i" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/grupa">{"Grupa"}</a>
          <a id="ig0qz" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/sesija">{"Sesija"}</a>
          <a id="iuyel" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/sesijaklijent">{"SesijaKlijent"}</a>
          <a id="ilxl5" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/sesijagrupa">{"SesijaGrupa"}</a>
          <a id="imuuh" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/cena">{"Cena"}</a>
        </div>
        <p id="idnlv" style={{"marginTop": "auto", "paddingTop": "20px", "borderTop": "1px solid rgba(255,255,255,0.2)", "fontSize": "11px", "opacity": "0.8", "textAlign": "center", "--chart-color-palette": "default"}}>{"© 2026 BESSER. All rights reserved."}</p>
      </nav>
      <main id="i7uqh" style={{"flex": "1", "padding": "40px", "overflowY": "auto", "background": "#f5f5f5", "--chart-color-palette": "default"}}>
        <h1 id="ip5s4" style={{"marginTop": "0", "color": "#333", "fontSize": "32px", "marginBottom": "10px", "--chart-color-palette": "default"}}>{"Klijent"}</h1>
        <p id="i7486" style={{"color": "#666", "marginBottom": "30px", "--chart-color-palette": "default"}}>{"Manage Klijent data"}</p>
        <TableBlock id="table-klijent-0" styles={{"width": "100%", "minHeight": "400px", "--chart-color-palette": "default"}} title="Klijent List" options={{"showHeader": true, "stripedRows": false, "showPagination": true, "rowsPerPage": 5, "actionButtons": true, "columns": [{"label": "Id", "column_type": "field", "field": "id", "type": "int", "required": true}, {"label": "Ime", "column_type": "field", "field": "ime", "type": "str", "required": true}, {"label": "Prezime", "column_type": "field", "field": "prezime", "type": "str", "required": true}, {"label": "Broj Telefona", "column_type": "field", "field": "broj_telefona", "type": "str", "required": true}, {"label": "Email", "column_type": "field", "field": "email", "type": "str", "required": true}], "formColumns": [{"column_type": "field", "field": "id", "label": "id", "type": "int", "required": true, "defaultValue": null}, {"column_type": "field", "field": "ime", "label": "ime", "type": "str", "required": true, "defaultValue": null}, {"column_type": "field", "field": "prezime", "label": "prezime", "type": "str", "required": true, "defaultValue": null}, {"column_type": "field", "field": "broj_telefona", "label": "broj_telefona", "type": "str", "required": true, "defaultValue": null}, {"column_type": "field", "field": "email", "label": "email", "type": "str", "required": true, "defaultValue": null}, {"column_type": "lookup", "path": "sesijaklijent", "field": "sesijaklijent", "lookup_field": "id", "entity": "SesijaKlijent", "type": "list", "required": false}, {"column_type": "lookup", "path": "cena_1", "field": "cena_1", "lookup_field": "id", "entity": "Cena", "type": "list", "required": false}]}} dataBinding={{"entity": "Klijent", "endpoint": "/klijent/"}} />
      </main>
    </div>    </div>
  );
};

export default Klijent;
