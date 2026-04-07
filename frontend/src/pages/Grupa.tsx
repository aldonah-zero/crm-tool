import React from "react";
import { TableBlock } from "../components/runtime/TableBlock";

const Grupa: React.FC = () => {
  return (
    <div id="page-grupa-1">
    <div id="id4jl" style={{"height": "100vh", "fontFamily": "Arial, sans-serif", "display": "flex", "--chart-color-palette": "default"}}>
      <nav id="issn8" style={{"width": "250px", "padding": "20px", "display": "flex", "overflowY": "auto", "background": "linear-gradient(135deg, #4b3c82 0%, #5a3d91 100%)", "color": "white", "--chart-color-palette": "default", "flexDirection": "column"}}>
        <h2 id="iyrr7" style={{"fontSize": "24px", "fontWeight": "bold", "marginTop": "0", "marginBottom": "30px", "--chart-color-palette": "default"}}>{"BESSER"}</h2>
        <div id="ih3c1" style={{"display": "flex", "--chart-color-palette": "default", "flexDirection": "column", "flex": "1"}}>
          <a id="iusvq" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/klijent">{"Klijent"}</a>
          <a id="ijseg" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "rgba(255,255,255,0.2)", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/grupa">{"Grupa"}</a>
          <a id="iscxd" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/sesija">{"Sesija"}</a>
          <a id="ivnpu" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/sesijaklijent">{"SesijaKlijent"}</a>
          <a id="ie49r" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/sesijagrupa">{"SesijaGrupa"}</a>
          <a id="ilgbe" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/cena">{"Cena"}</a>
        </div>
        <p id="it6gl" style={{"fontSize": "11px", "paddingTop": "20px", "marginTop": "auto", "textAlign": "center", "opacity": "0.8", "borderTop": "1px solid rgba(255,255,255,0.2)", "--chart-color-palette": "default"}}>{"© 2026 BESSER. All rights reserved."}</p>
      </nav>
      <main id="ii3ry" style={{"padding": "40px", "overflowY": "auto", "background": "#f5f5f5", "--chart-color-palette": "default", "flex": "1"}}>
        <h1 id="im79j" style={{"fontSize": "32px", "marginTop": "0", "marginBottom": "10px", "color": "#333", "--chart-color-palette": "default"}}>{"Grupa"}</h1>
        <p id="ick5d" style={{"marginBottom": "30px", "color": "#666", "--chart-color-palette": "default"}}>{"Manage Grupa data"}</p>
        <TableBlock id="table-grupa-1" styles={{"width": "100%", "minHeight": "400px", "--chart-color-palette": "default"}} title="Grupa List" options={{"showHeader": true, "stripedRows": false, "showPagination": true, "rowsPerPage": 5, "actionButtons": true, "columns": [{"label": "Id", "column_type": "field", "field": "id", "type": "int", "required": true}, {"label": "Naziv", "column_type": "field", "field": "naziv", "type": "str", "required": true}, {"label": "Opis", "column_type": "field", "field": "opis", "type": "str", "required": true}, {"label": "Cena", "column_type": "field", "field": "cena", "type": "float", "required": true}], "formColumns": [{"column_type": "field", "field": "id", "label": "id", "type": "int", "required": true, "defaultValue": null}, {"column_type": "field", "field": "naziv", "label": "naziv", "type": "str", "required": true, "defaultValue": null}, {"column_type": "field", "field": "opis", "label": "opis", "type": "str", "required": true, "defaultValue": null}, {"column_type": "field", "field": "cena", "label": "cena", "type": "float", "required": true, "defaultValue": null}, {"column_type": "lookup", "path": "sesijagrupa", "field": "sesijagrupa", "lookup_field": "id", "entity": "SesijaGrupa", "type": "list", "required": false}]}} dataBinding={{"entity": "Grupa", "endpoint": "/grupa/"}} />
      </main>
    </div>    </div>
  );
};

export default Grupa;
