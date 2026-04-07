import React from "react";
import { TableBlock } from "../components/runtime/TableBlock";

const Sesijagrupa: React.FC = () => {
  return (
    <div id="page-sesijagrupa-4">
    <div id="i49jqy" style={{"display": "flex", "height": "100vh", "fontFamily": "Arial, sans-serif", "--chart-color-palette": "default"}}>
      <nav id="ivneij" style={{"width": "250px", "background": "linear-gradient(135deg, #4b3c82 0%, #5a3d91 100%)", "color": "white", "padding": "20px", "overflowY": "auto", "display": "flex", "flexDirection": "column", "--chart-color-palette": "default"}}>
        <h2 id="ihxwwg" style={{"marginTop": "0", "fontSize": "24px", "marginBottom": "30px", "fontWeight": "bold", "--chart-color-palette": "default"}}>{"BESSER"}</h2>
        <div id="ix8luf" style={{"display": "flex", "flexDirection": "column", "flex": "1", "--chart-color-palette": "default"}}>
          <a id="iu0hts" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/klijent">{"Klijent"}</a>
          <a id="ioy95v" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/grupa">{"Grupa"}</a>
          <a id="inkbkj" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/sesija">{"Sesija"}</a>
          <a id="izj5nf" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/sesijaklijent">{"SesijaKlijent"}</a>
          <a id="i1a40f" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "rgba(255,255,255,0.2)", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/sesijagrupa">{"SesijaGrupa"}</a>
          <a id="ikumem" style={{"color": "white", "textDecoration": "none", "padding": "10px 15px", "display": "block", "background": "transparent", "borderRadius": "4px", "marginBottom": "5px", "--chart-color-palette": "default"}} href="/cena">{"Cena"}</a>
        </div>
        <p id="ihpppr" style={{"marginTop": "auto", "paddingTop": "20px", "borderTop": "1px solid rgba(255,255,255,0.2)", "fontSize": "11px", "opacity": "0.8", "textAlign": "center", "--chart-color-palette": "default"}}>{"© 2026 BESSER. All rights reserved."}</p>
      </nav>
      <main id="ia63c4" style={{"flex": "1", "padding": "40px", "overflowY": "auto", "background": "#f5f5f5", "--chart-color-palette": "default"}}>
        <h1 id="ie0xrq" style={{"marginTop": "0", "color": "#333", "fontSize": "32px", "marginBottom": "10px", "--chart-color-palette": "default"}}>{"SesijaGrupa"}</h1>
        <p id="iei9l1" style={{"color": "#666", "marginBottom": "30px", "--chart-color-palette": "default"}}>{"Manage SesijaGrupa data"}</p>
        <TableBlock id="table-sesijagrupa-4" styles={{"width": "100%", "minHeight": "400px", "--chart-color-palette": "default"}} title="SesijaGrupa List" options={{"showHeader": true, "stripedRows": false, "showPagination": true, "rowsPerPage": 5, "actionButtons": true, "columns": [{"label": "Id", "column_type": "field", "field": "id", "type": "int", "required": true}], "formColumns": [{"column_type": "field", "field": "id", "label": "id", "type": "int", "required": true, "defaultValue": null}, {"column_type": "lookup", "path": "grupa", "field": "grupa", "lookup_field": "id", "entity": "Grupa", "type": "str", "required": true}, {"column_type": "lookup", "path": "sesija_1", "field": "sesija_1", "lookup_field": "id", "entity": "Sesija", "type": "str", "required": true}]}} dataBinding={{"entity": "SesijaGrupa", "endpoint": "/sesijagrupa/"}} />
      </main>
    </div>    </div>
  );
};

export default Sesijagrupa;
