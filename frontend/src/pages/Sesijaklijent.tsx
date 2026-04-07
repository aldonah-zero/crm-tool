import React from "react";
import { TableBlock } from "../components/runtime/TableBlock";

const Sesijaklijent: React.FC = () => {
  return (
    <div id="page-sesijaklijent-3">
    <div id="idv6yw" style={{"height": "100vh", "fontFamily": "Arial, sans-serif", "display": "flex", "--chart-color-palette": "default"}}>
      <nav id="iyjwmj" style={{"width": "250px", "padding": "20px", "display": "flex", "overflowY": "auto", "background": "linear-gradient(135deg, #4b3c82 0%, #5a3d91 100%)", "color": "white", "--chart-color-palette": "default", "flexDirection": "column"}}>
        <h2 id="iycd9u" style={{"fontSize": "24px", "fontWeight": "bold", "marginTop": "0", "marginBottom": "30px", "--chart-color-palette": "default"}}>{"BESSER"}</h2>
        <div id="irjcg7" style={{"display": "flex", "--chart-color-palette": "default", "flexDirection": "column", "flex": "1"}}>
          <a id="igihoz" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/klijent">{"Klijent"}</a>
          <a id="ik8jik" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/grupa">{"Grupa"}</a>
          <a id="iycliq" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/sesija">{"Sesija"}</a>
          <a id="i50umx" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "rgba(255,255,255,0.2)", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/sesijaklijent">{"SesijaKlijent"}</a>
          <a id="iciyxw" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/sesijagrupa">{"SesijaGrupa"}</a>
          <a id="iqk4sm" style={{"padding": "10px 15px", "textDecoration": "none", "marginBottom": "5px", "display": "block", "background": "transparent", "color": "white", "borderRadius": "4px", "--chart-color-palette": "default"}} href="/cena">{"Cena"}</a>
        </div>
        <p id="iba9gw" style={{"fontSize": "11px", "paddingTop": "20px", "marginTop": "auto", "textAlign": "center", "opacity": "0.8", "borderTop": "1px solid rgba(255,255,255,0.2)", "--chart-color-palette": "default"}}>{"© 2026 BESSER. All rights reserved."}</p>
      </nav>
      <main id="i3ufe6" style={{"padding": "40px", "overflowY": "auto", "background": "#f5f5f5", "--chart-color-palette": "default", "flex": "1"}}>
        <h1 id="ielgqa" style={{"fontSize": "32px", "marginTop": "0", "marginBottom": "10px", "color": "#333", "--chart-color-palette": "default"}}>{"SesijaKlijent"}</h1>
        <p id="ifxext" style={{"marginBottom": "30px", "color": "#666", "--chart-color-palette": "default"}}>{"Manage SesijaKlijent data"}</p>
        <TableBlock id="table-sesijaklijent-3" styles={{"width": "100%", "minHeight": "400px", "--chart-color-palette": "default"}} title="SesijaKlijent List" options={{"showHeader": true, "stripedRows": false, "showPagination": true, "rowsPerPage": 5, "actionButtons": true, "columns": [{"label": "Id", "column_type": "field", "field": "id", "type": "int", "required": true}], "formColumns": [{"column_type": "field", "field": "id", "label": "id", "type": "int", "required": true, "defaultValue": null}, {"column_type": "lookup", "path": "klijent", "field": "klijent", "lookup_field": "broj_telefona", "entity": "Klijent", "type": "str", "required": true}, {"column_type": "lookup", "path": "sesija", "field": "sesija", "lookup_field": "id", "entity": "Sesija", "type": "str", "required": true}]}} dataBinding={{"entity": "SesijaKlijent", "endpoint": "/sesijaklijent/"}} />
      </main>
    </div>    </div>
  );
};

export default Sesijaklijent;
