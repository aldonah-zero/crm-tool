import React, { CSSProperties, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { createPortal } from "react-dom";
import { useTableContext } from "../../contexts/TableContext";
import { ColumnFilter } from "./ColumnFilter";
import { ColumnSort } from "./ColumnSort";
import "./TableComponent.css";

interface TableColumn {
  field: string;
  label: string;
  type?: string;
  columnType?: string;
  path?: string;
  entity?: string;
  options?: string[];
  required?: boolean;
  lookupField?: string;
  relationshipKey?: string;
  klijent_field?: string;
  grupa_field?: string;
}

interface TableOptions {
  showHeader?: boolean;
  stripedRows?: boolean;
  showPagination?: boolean;
  rowsPerPage?: number;
  showPaymentButton?: boolean;
  showExportButton?: boolean;
  columns?: Array<
    | {
        field: string;
        label?: string;
        type?: string;
        column_type?: string;
        path?: string;
      }
    | string
  >;
  formColumns?: Array<
    | {
        field: string;
        label?: string;
        type?: string;
        column_type?: string;
        path?: string;
        lookup_field?: string;
        lookupField?: string;
      }
    | string
  >;
  form_columns?: Array<
    | {
        field: string;
        label?: string;
        type?: string;
        column_type?: string;
        path?: string;
        lookup_field?: string;
        lookupField?: string;
      }
    | string
  >;
}

interface Props {
  id: string;
  title?: string;
  data?: any[];
  options?: TableOptions;
  styles?: CSSProperties;
  dataBinding?: Record<string, any>;
}

const humanize = (value: string): string => {
  if (!value) {
    return "";
  }
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (str) => str.toUpperCase());
};

const formatCellValue = (value: any, type?: string): string => {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" &&
    (type === "datetime" || value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/))
  ) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return (
        d.toLocaleDateString("sr-Latn", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }) +
        " " +
        d.toLocaleTimeString("sr-Latn", { hour: "2-digit", minute: "2-digit" })
      );
    }
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value instanceof Date) return value.toLocaleString();
  return JSON.stringify(value);
};

const getNestedValue = (obj: any, path: string): any => {
  return path.split(".").reduce((current, key) => current?.[key], obj);
};

// ============================================
// Excel Export Helper
// ============================================
const exportToExcel = async (dataBinding: Record<string, any> | undefined) => {
  const backendBase = import.meta.env.VITE_API_URL || "http://localhost:8000";
  try {
    const response = await axios.get(`${backendBase}/sesija/export-excel/`, {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    const today = new Date().toISOString().split("T")[0];
    link.setAttribute("download", `izvestaj_sesije_${today}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Error exporting Excel:", err);
    alert("Greška pri izvozu Excel fajla. Proverite backend.");
  }
};

export const TableComponent: React.FC<Props> = ({
  id,
  title,
  data,
  options,
  styles,
  dataBinding,
}) => {
  const [tableData, setTableData] = useState<any[]>(data ?? []);
  const { setSelectedRow, registerTableRefresh } = useTableContext();
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>(
    {},
  );
  const [sortConfig, setSortConfig] = useState<{
    field: string;
    direction: "asc" | "desc";
  } | null>(null);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalClosing, setPaymentModalClosing] = useState(false);
  const [paymentRow, setPaymentRow] = useState<any>(null);
  const [paymentValues, setPaymentValues] = useState<Record<string, any>>({});
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const closePaymentModal = () => {
    setPaymentModalClosing(true);
    setTimeout(() => {
      setShowPaymentModal(false);
      setPaymentModalClosing(false);
      setPaymentError("");
    }, 200);
  };

  const fetchTableData = async () => {
    const endpoint = dataBinding?.endpoint
      ? dataBinding.endpoint
      : dataBinding?.entity
        ? `/${dataBinding.entity}/`
        : id
          ? `/${id}/`
          : "";
    if (!endpoint) return;
    const backendBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

    const hasLookupColumns = options?.columns?.some(
      (col: any) => typeof col === "object" && col.column_type === "lookup",
    );

    const urlParams = hasLookupColumns ? "?detailed=true" : "";
    const url = endpoint.startsWith("/")
      ? backendBase + endpoint + urlParams
      : endpoint + urlParams;

    try {
      const response = await axios.get(url);
      if (Array.isArray(response.data)) {
        setTableData(response.data);
      } else if (response.data && typeof response.data === "object") {
        setTableData(
          Array.isArray(response.data.results)
            ? response.data.results
            : [response.data],
        );
      }
    } catch (err) {
      console.error("Error fetching table data:", err);
    }
  };

  useEffect(() => {
    registerTableRefresh(id, fetchTableData);
  }, [id]);

  useEffect(() => {
    if (data && Array.isArray(data)) {
      setTableData(data);
    } else {
      fetchTableData();
    }
  }, [data]);

  const resolvedOptions: Required<TableOptions> & { actionButtons: boolean } = {
    showHeader: options?.showHeader ?? true,
    stripedRows: options?.stripedRows ?? false,
    showPagination: options?.showPagination ?? true,
    rowsPerPage: options?.rowsPerPage ?? 5,
    showPaymentButton: (options as any)?.showPaymentButton ?? false,
    showExportButton: (options as any)?.showExportButton ?? false,
    columns: options?.columns ?? [],
    formColumns:
      (options as any)?.formColumns ?? (options as any)?.form_columns ?? [],
    actionButtons:
      (options as any)?.actionButtons ??
      (options as any)?.["action-buttons"] ??
      false,
  };

  const normalizeOptionColumns = (rawColumns: any[]): TableColumn[] => {
    if (!Array.isArray(rawColumns) || rawColumns.length === 0) {
      return [];
    }
    return rawColumns
      .filter(
        (
          col,
        ): col is
          | {
              field: string;
              label?: string;
              type?: string;
              column_type?: string;
              path?: string;
              entity?: string;
              options?: string[];
              required?: boolean;
              lookup_field?: string;
              lookupField?: string;
              klijent_field?: string;
              grupa_field?: string;
            }
          | string => Boolean(col),
      )
      .map((col) => {
        if (typeof col === "string") {
          return { field: col, label: humanize(col), type: "string" };
        }
        const actualField =
          col.column_type === "lookup" && col.path ? col.path : col.field;
        const relationshipKey =
          col.column_type === "lookup" && col.path ? col.path : undefined;
        const lookupField =
          (col as any).lookup_field ?? (col as any).lookupField ?? col.field;
        return {
          field: actualField,
          label: humanize(col.label || col.field),
          type: col.type || "string",
          columnType: col.column_type,
          path: col.path,
          entity: col.entity,
          options: col.options,
          required: col.required ?? false,
          lookupField: col.column_type === "lookup" ? lookupField : undefined,
          relationshipKey: relationshipKey,
          klijent_field: (col as any).klijent_field,
          grupa_field: (col as any).grupa_field,
        };
      });
  };

  const normalizedRows = useMemo(() => {
    if (!Array.isArray(tableData)) {
      return [];
    }
    return tableData
      .filter((row) => row !== null && row !== undefined)
      .map((row) => {
        if (row && typeof row === "object" && !Array.isArray(row)) {
          return row;
        }
        return { value: row };
      });
  }, [tableData]);

  const columns: TableColumn[] = useMemo(() => {
    if (resolvedOptions.columns.length > 0) {
      return normalizeOptionColumns(resolvedOptions.columns);
    }

    if (normalizedRows.length === 0) {
      return [];
    }

    const columnOrder: string[] = [];
    normalizedRows.forEach((row) => {
      Object.keys(row || {}).forEach((key) => {
        if (!columnOrder.includes(key)) {
          columnOrder.push(key);
        }
      });
    });

    return columnOrder.map((field) => ({
      field,
      label: humanize(field),
      type: "string",
    }));
  }, [normalizedRows, resolvedOptions.columns]);

  const formColumns: TableColumn[] = useMemo(() => {
    const normalizedFormColumns = normalizeOptionColumns(
      resolvedOptions.formColumns ?? [],
    );
    return normalizedFormColumns.length > 0 ? normalizedFormColumns : columns;
  }, [columns, resolvedOptions.formColumns]);

  const filteredRows = useMemo(() => {
    if (Object.keys(columnFilters).length === 0) {
      return normalizedRows;
    }

    return normalizedRows.filter((row) => {
      return Object.entries(columnFilters).every(([field, filterValue]) => {
        if (!filterValue) return true;

        const column = columns.find((col) => col.field === field);
        let cellValue;

        if (column?.columnType === "lookup" && column.lookupField) {
          if (column.type === "list") {
            const relatedArray = row[column.field];
            if (Array.isArray(relatedArray)) {
              cellValue = relatedArray
                .map((item) => item[column.lookupField!])
                .filter((val) => val !== null && val !== undefined)
                .join(", ");
            } else {
              cellValue = "";
            }
          } else {
            if (column.relationshipKey) {
              cellValue = getNestedValue(
                row,
                `${column.relationshipKey}.${column.lookupField}`,
              );
            }
            if (!cellValue) {
              cellValue = getNestedValue(
                row,
                `${column.field}.${column.lookupField}`,
              );
            }
          }
        } else {
          cellValue = row[field];
        }

        if (filterValue === "empty") {
          return (
            cellValue === null || cellValue === undefined || cellValue === ""
          );
        }
        if (filterValue === "not_empty") {
          return (
            cellValue !== null && cellValue !== undefined && cellValue !== ""
          );
        }

        const parts = filterValue.split(":");
        const operator = parts[0];
        const searchValue = parts.slice(1).join(":");

        if (!searchValue && operator !== "empty" && operator !== "not_empty") {
          return String(cellValue || "")
            .toLowerCase()
            .includes(filterValue.toLowerCase());
        }

        if (cellValue === null || cellValue === undefined) {
          return false;
        }

        const cellStr = String(cellValue).toLowerCase();
        const searchStr = searchValue.toLowerCase();

        if (operator === "contains") return cellStr.includes(searchStr);
        if (operator === "equals") return cellStr === searchStr;
        if (operator === "starts_with") return cellStr.startsWith(searchStr);
        if (operator === "ends_with") return cellStr.endsWith(searchStr);

        const cellNum = Number(cellValue);
        const searchNum = Number(searchValue);

        if (!isNaN(cellNum) && !isNaN(searchNum)) {
          if (operator === "eq") return cellNum === searchNum;
          if (operator === "ne") return cellNum !== searchNum;
          if (operator === "gt") return cellNum > searchNum;
          if (operator === "gte") return cellNum >= searchNum;
          if (operator === "lt") return cellNum < searchNum;
          if (operator === "lte") return cellNum <= searchNum;
        }

        const cellDate = new Date(cellValue);
        const searchDate = new Date(searchValue);

        if (!isNaN(cellDate.getTime()) && !isNaN(searchDate.getTime())) {
          if (operator === "eq")
            return cellDate.getTime() === searchDate.getTime();
          if (operator === "ne")
            return cellDate.getTime() !== searchDate.getTime();
          if (operator === "gt")
            return cellDate.getTime() > searchDate.getTime();
          if (operator === "gte")
            return cellDate.getTime() >= searchDate.getTime();
          if (operator === "lt")
            return cellDate.getTime() < searchDate.getTime();
          if (operator === "lte")
            return cellDate.getTime() <= searchDate.getTime();
        }

        if (operator === "eq") return cellStr === searchStr;
        if (operator === "ne") return cellStr !== searchStr;
        if (operator === "gt") return cellStr > searchStr;
        if (operator === "gte") return cellStr >= searchStr;
        if (operator === "lt") return cellStr < searchStr;
        if (operator === "lte") return cellStr <= searchStr;

        return false;
      });
    });
  }, [normalizedRows, columnFilters, columns]);

  const handleFilterChange = (field: string, value: string) => {
    setColumnFilters((prev) => {
      if (!value) {
        const newFilters = { ...prev };
        delete newFilters[field];
        return newFilters;
      }
      return { ...prev, [field]: value };
    });
    setCurrentPage(1);
  };

  const handleSortChange = (field: string) => {
    setSortConfig((prev) => {
      if (!prev || prev.field !== field) {
        return { field, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { field, direction: "desc" };
      }
      return null;
    });
  };

  const sortedAndFilteredRows = useMemo(() => {
    if (!sortConfig) {
      return filteredRows;
    }

    const sorted = [...filteredRows].sort((a, b) => {
      const aValue = a[sortConfig.field];
      const bValue = b[sortConfig.field];

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      const aNum = Number(aValue);
      const bNum = Number(bValue);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortConfig.direction === "asc" ? aNum - bNum : bNum - aNum;
      }

      const aDate = new Date(aValue);
      const bDate = new Date(bValue);
      if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
        return sortConfig.direction === "asc"
          ? aDate.getTime() - bDate.getTime()
          : bDate.getTime() - aDate.getTime();
      }

      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();

      if (sortConfig.direction === "asc") {
        return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
      } else {
        return bStr < aStr ? -1 : bStr > aStr ? 1 : 0;
      }
    });

    return sorted;
  }, [filteredRows, sortConfig]);

  const pageSize = Math.max(
    1,
    Number.isFinite(Number(resolvedOptions.rowsPerPage))
      ? Number(resolvedOptions.rowsPerPage)
      : 5,
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editRowData, setEditRowData] = useState<any>(null);
  const [lookupOptions, setLookupOptions] = useState<Record<string, any[]>>({});
  const [validationError, setValidationError] = useState<string>("");
  const [modalClosing, setModalClosing] = useState(false);
  const [tableSaving, setTableSaving] = useState(false);
  const closeModal = () => {
    setModalClosing(true);
    setTimeout(() => {
      setShowModal(false);
      setModalClosing(false);
    }, 200);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, filteredRows.length]);

  useEffect(() => {
    if (!showModal && !showPaymentModal) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showPaymentModal) closePaymentModal();
        else closeModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showModal, showPaymentModal]);

  useEffect(() => {
    if (showModal) {
      setValidationError("");
      const initialValues: Record<string, any> = {};
      formColumns.forEach((col) => {
        if (modalMode === "edit" && editRowData) {
          if (col.columnType === "session_type") {
            if (editRowData.grupa_id || editRowData.grupa_naziv) {
              initialValues["session_type"] = "grupa";
              initialValues["grupa_id"] = editRowData.grupa_id || "";
              initialValues["klijent_id"] = "";
            } else {
              initialValues["session_type"] = "individualna";
              initialValues["klijent_id"] = "";
              initialValues["grupa_id"] = "";
              const sk = editRowData.sesijaklijent_1;
              if (Array.isArray(sk) && sk.length > 0) {
                initialValues["klijent_id"] = sk[0].klijent_id || "";
              }
            }
          } else if (col.columnType === "grupa_clanovi") {
            initialValues[col.field] = [];
          } else if (col.columnType === "lookup") {
            if (col.type === "list") {
              const relatedArray =
                editRowData[col.relationshipKey || col.field];
              if (Array.isArray(relatedArray)) {
                initialValues[col.field] = relatedArray.map((item: any) =>
                  String(item.id),
                );
              } else {
                initialValues[col.field] = [];
              }
            } else {
              const fkField = col.path || col.field;
              const fkIdField = `${fkField}_id`;
              initialValues[col.field] = editRowData[fkIdField] ?? "";
            }
          } else {
            const value = editRowData[col.field];
            if (col.type === "list") {
              initialValues[col.field] = Array.isArray(value)
                ? value.join(", ")
                : (value ?? "");
            } else {
              initialValues[col.field] = value ?? "";
            }
          }
        } else {
          if (col.columnType === "session_type") {
            initialValues["session_type"] = "individualna";
            initialValues["klijent_id"] = "";
            initialValues["grupa_id"] = "";
          } else if (col.columnType === "grupa_clanovi") {
            initialValues[col.field] = [];
          } else if (col.columnType === "lookup" && col.type === "list") {
            initialValues[col.field] = [];
          } else {
            initialValues[col.field] = "";
          }
        }
      });
      setFormValues(initialValues);

      const fetchLookupOptions = async () => {
        const opts: Record<string, any[]> = {};
        const backendBase =
          import.meta.env.VITE_API_URL || "http://localhost:8000";

        const entitiesToFetch = new Set<string>();

        for (const col of formColumns) {
          if (col.columnType === "lookup" && col.entity) {
            entitiesToFetch.add(col.entity.toLowerCase());
          }
          if (col.columnType === "session_type") {
            entitiesToFetch.add("klijent");
            entitiesToFetch.add("grupa");
          }
          if (col.columnType === "grupa_clanovi" && col.entity) {
            entitiesToFetch.add(col.entity.toLowerCase());
          }
        }

        for (const endpoint of entitiesToFetch) {
          try {
            const response = await axios.get(`${backendBase}/${endpoint}/`);
            if (Array.isArray(response.data)) {
              opts[endpoint] = response.data;
            } else if (response.data && typeof response.data === "object") {
              opts[endpoint] = Array.isArray(response.data.results)
                ? response.data.results
                : [response.data];
            }
          } catch (err) {
            console.error(`Error fetching ${endpoint} options:`, err);
            opts[endpoint] = [];
          }
        }

        setLookupOptions(opts);

        if (modalMode === "edit" && editRowData) {
          for (const col of formColumns) {
            if (col.columnType === "grupa_clanovi") {
              try {
                const grupaId = editRowData.id;
                const response = await axios.get(
                  `${backendBase}/grupaklijent/by-grupa/${grupaId}/`,
                );
                if (Array.isArray(response.data)) {
                  const memberIds = response.data.map((gk: any) =>
                    String(gk.klijent_id),
                  );
                  setFormValues((fv) => ({
                    ...fv,
                    [col.field]: memberIds,
                  }));
                }
              } catch (err) {
                console.error("Error fetching group members:", err);
              }
            }
          }
        }
      };

      fetchLookupOptions();
    }
  }, [showModal, formColumns, modalMode, editRowData]);

  const totalPages = resolvedOptions.showPagination
    ? Math.max(1, Math.ceil(sortedAndFilteredRows.length / pageSize))
    : 1;

  const visibleRows = useMemo(() => {
    if (!resolvedOptions.showPagination) {
      return sortedAndFilteredRows;
    }
    const start = (currentPage - 1) * pageSize;
    return sortedAndFilteredRows.slice(start, start + pageSize);
  }, [
    currentPage,
    sortedAndFilteredRows,
    pageSize,
    resolvedOptions.showPagination,
  ]);

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    padding: "20px",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    boxSizing: "border-box",
    overflow: "hidden",
    position: "relative",
    ...styles,
  };

  const tableStyle: CSSProperties = {
    borderCollapse: "collapse",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: "14px",
    width: "100%",
    tableLayout: "auto",
  };

  const getEndpoint = () => {
    let endpoint = "";
    if (dataBinding?.endpoint) {
      endpoint = dataBinding.endpoint;
    } else if (dataBinding?.entity) {
      endpoint = `/${dataBinding.entity}/`;
    }
    if (!endpoint && id) {
      endpoint = `/${id}/`;
    }
    return endpoint;
  };

  const getRowId = (row: any) => {
    return row?.id ?? row?.ID ?? row?.Id ?? Object.values(row)[0];
  };

  // ============================================
  // Handle "Označi plaćeno" click
  // ============================================
  const handleMarkAsPaid = (row: any) => {
    setPaymentRow(row);
    setPaymentValues({
      nacin_placanja: "gotovina",
      datum_uplate: new Date().toISOString().split("T")[0],
    });
    setPaymentError("");
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async () => {
    if (!paymentRow) return;

    setPaymentSaving(true);
    setPaymentError("");
    const backendBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

    try {
      await axios.post(`${backendBase}/sesija/${paymentRow.id}/mark-paid/`, {
        nacin_placanja: paymentValues.nacin_placanja || "gotovina",
        datum_uplate: paymentValues.datum_uplate,
      });

      closePaymentModal();
      await fetchTableData();
    } catch (err: any) {
      console.error("Error marking as paid:", err);
      const detail = err?.response?.data?.detail;
      setPaymentError(
        typeof detail === "string" ? detail : "Greška pri označavanju uplate.",
      );
    } finally {
      setPaymentSaving(false);
    }
  };

  // Helper to render a form field based on column type
  const renderFormField = (col: TableColumn) => {
    // ============================================
    // SESSION TYPE: radio toggle + dropdown
    // ============================================
    if (col.columnType === "session_type") {
      const sessionType = formValues["session_type"] || "individualna";
      const klijentOptions = lookupOptions["klijent"] || [];
      const grupaOptions = lookupOptions["grupa"] || [];

      return (
        <div key={col.field} className="table-form-group">
          <label className="table-form-label">
            {col.label}
            <span className="table-form-required">*</span>
          </label>

          <div
            style={{
              display: "flex",
              gap: "0",
              marginBottom: "12px",
              borderRadius: "10px",
              overflow: "hidden",
              border: "1.5px solid #e2e8f0",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setFormValues((fv) => ({
                  ...fv,
                  session_type: "individualna",
                  klijent_id: fv.klijent_id || "",
                  grupa_id: "",
                }));
              }}
              style={{
                flex: 1,
                padding: "10px 16px",
                border: "none",
                background:
                  sessionType === "individualna"
                    ? "linear-gradient(135deg, #6366f1, #7c3aed)"
                    : "#f8fafc",
                color: sessionType === "individualna" ? "#fff" : "#64748b",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontFamily: "inherit",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Individualna
            </button>
            <button
              type="button"
              onClick={() => {
                setFormValues((fv) => ({
                  ...fv,
                  session_type: "grupa",
                  klijent_id: "",
                  grupa_id: fv.grupa_id || "",
                }));
              }}
              style={{
                flex: 1,
                padding: "10px 16px",
                border: "none",
                borderLeft: "1.5px solid #e2e8f0",
                background:
                  sessionType === "grupa"
                    ? "linear-gradient(135deg, #6366f1, #7c3aed)"
                    : "#f8fafc",
                color: sessionType === "grupa" ? "#fff" : "#64748b",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontFamily: "inherit",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Grupna
            </button>
          </div>

          {sessionType === "individualna" ? (
            <select
              value={formValues["klijent_id"] ?? ""}
              onChange={(e) =>
                setFormValues((fv) => ({ ...fv, klijent_id: e.target.value }))
              }
              className="table-form-select"
            >
              <option value="">-- Izaberi klijenta --</option>
              {klijentOptions.map((k: any) => (
                <option key={k.id} value={k.id}>
                  {k.ime} {k.prezime}
                  {k.email ? ` (${k.email})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={formValues["grupa_id"] ?? ""}
              onChange={(e) =>
                setFormValues((fv) => ({ ...fv, grupa_id: e.target.value }))
              }
              className="table-form-select"
            >
              <option value="">-- Izaberi grupu --</option>
              {grupaOptions.map((g: any) => (
                <option key={g.id} value={g.id}>
                  {g.naziv}
                  {g.broj_clanova !== undefined
                    ? ` (${g.broj_clanova} članova)`
                    : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      );
    }

    // ============================================
    // GRUPA CLANOVI
    // ============================================
    if (col.columnType === "grupa_clanovi") {
      const entityKey = (col.entity || "klijent").toLowerCase();
      const opts = lookupOptions[entityKey] || [];
      const selectedValues: string[] = formValues[col.field] || [];

      return (
        <div key={col.field} className="table-form-group">
          <label className="table-form-label">
            {col.label}
            {col.required && <span className="table-form-required">*</span>}
            <span className="table-form-hint">
              ({selectedValues.length} izabrano)
            </span>
          </label>
          <div className="table-form-checkbox-list">
            {opts.length === 0 ? (
              <div className="table-form-no-options">
                Nema dostupnih klijenata
              </div>
            ) : (
              opts.map((klijent: any) => {
                const isChecked = selectedValues.includes(String(klijent.id));
                return (
                  <div
                    key={klijent.id}
                    className={`table-form-checkbox-item ${isChecked ? "checked" : ""}`}
                    onClick={() => {
                      const valueStr = String(klijent.id);
                      const newSelected = isChecked
                        ? selectedValues.filter((v: string) => v !== valueStr)
                        : [...selectedValues, valueStr];
                      setFormValues((fv) => ({
                        ...fv,
                        [col.field]: newSelected,
                      }));
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="table-form-checkbox"
                    />
                    <span className="table-form-checkbox-label">
                      {klijent.ime} {klijent.prezime}
                      {klijent.email ? ` — ${klijent.email}` : ""}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }

    // ============================================
    // LOOKUP
    // ============================================
    if (col.columnType === "lookup" && col.entity) {
      const endpoint = col.entity.toLowerCase();
      const opts = lookupOptions[endpoint] || [];

      if (col.type === "list") {
        const selectedValues = formValues[col.field] || [];
        return (
          <div key={col.field} className="table-form-group">
            <label className="table-form-label">
              {col.label}
              {col.required && <span className="table-form-required">*</span>}
              <span className="table-form-hint">
                ({selectedValues.length} selected)
              </span>
            </label>
            <div className="table-form-checkbox-list">
              {opts.length === 0 ? (
                <div className="table-form-no-options">
                  No options available
                </div>
              ) : (
                opts.map((option: any) => {
                  const isChecked = selectedValues.includes(String(option.id));
                  return (
                    <div
                      key={option.id}
                      className={`table-form-checkbox-item ${isChecked ? "checked" : ""}`}
                      onClick={() => {
                        const valueStr = String(option.id);
                        const newSelected = isChecked
                          ? selectedValues.filter((v: string) => v !== valueStr)
                          : [...selectedValues, valueStr];
                        setFormValues((fv) => ({
                          ...fv,
                          [col.field]: newSelected,
                        }));
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="table-form-checkbox"
                      />
                      <span className="table-form-checkbox-label">
                        {(col.lookupField && option[col.lookupField]) ||
                          option.pages ||
                          option.stock ||
                          option.title ||
                          `ID: ${option.id}`}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      }

      return (
        <div key={col.field} className="table-form-group">
          <label
            htmlFor={`modal-input-${col.field}`}
            className="table-form-label"
          >
            {col.label}
            {col.required && <span className="table-form-required">*</span>}
          </label>
          <select
            id={`modal-input-${col.field}`}
            value={formValues[col.field] ?? ""}
            onChange={(e) =>
              setFormValues((fv) => ({ ...fv, [col.field]: e.target.value }))
            }
            className="table-form-select"
          >
            <option value="">-- Select {col.label} --</option>
            {opts.map((option: any) => (
              <option key={option.id} value={option.id}>
                {(col.lookupField && option[col.lookupField]) ||
                  option.pages ||
                  option.stock ||
                  option.title ||
                  `ID: ${option.id}`}
              </option>
            ))}
          </select>
        </div>
      );
    }

    // ============================================
    // ENUM
    // ============================================
    if (col.type === "enum" && col.options && col.options.length > 0) {
      return (
        <div key={col.field} className="table-form-group">
          <label
            htmlFor={`modal-input-${col.field}`}
            className="table-form-label"
          >
            {col.label}
            {col.required && <span className="table-form-required">*</span>}
          </label>
          <select
            id={`modal-input-${col.field}`}
            value={formValues[col.field] ?? ""}
            onChange={(e) =>
              setFormValues((fv) => ({ ...fv, [col.field]: e.target.value }))
            }
            className="table-form-select"
          >
            <option value="">-- Select {col.label} --</option>
            {col.options.map((option: string) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    }

    // ============================================
    // BOOLEAN
    // ============================================
    if (col.type === "bool" || col.type === "boolean") {
      return (
        <div key={col.field} className="table-form-group-row">
          <input
            id={`modal-input-${col.field}`}
            type="checkbox"
            checked={formValues[col.field] ?? false}
            onChange={(e) =>
              setFormValues((fv) => ({ ...fv, [col.field]: e.target.checked }))
            }
            className="table-form-checkbox"
          />
          <label
            htmlFor={`modal-input-${col.field}`}
            className="table-form-label"
            style={{ cursor: "pointer" }}
          >
            {col.label}
            {col.required && <span className="table-form-required">*</span>}
          </label>
        </div>
      );
    }

    // ============================================
    // DEFAULT
    // ============================================
    return (
      <div key={col.field} className="table-form-group">
        <label
          htmlFor={`modal-input-${col.field}`}
          className="table-form-label"
        >
          {col.label}
          {col.required && <span className="table-form-required">*</span>}
          {col.type && col.type !== "string" && col.type !== "str" && (
            <span className="table-form-hint">
              ({col.type === "list" ? "comma-separated" : col.type})
            </span>
          )}
        </label>
        <input
          id={`modal-input-${col.field}`}
          type={
            col.type === "int" || col.type === "float"
              ? "number"
              : col.type === "date"
                ? "date"
                : col.type === "datetime"
                  ? "datetime-local"
                  : col.type === "time"
                    ? "time"
                    : "text"
          }
          step={col.type === "float" ? "any" : undefined}
          value={formValues[col.field] ?? ""}
          onChange={(e) =>
            setFormValues((fv) => ({ ...fv, [col.field]: e.target.value }))
          }
          placeholder={col.type === "list" ? "item1, item2, item3" : ""}
          className="table-form-input"
        />
      </div>
    );
  };

  // ============================================
  // Render payment status cell
  // ============================================
  const renderPaymentStatusCell = (row: any) => {
    const isPaid = row.placeno === true;

    if (isPaid) {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 12px",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: 600,
            backgroundColor: "#dcfce7",
            color: "#166534",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#166534"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Plaćeno
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleMarkAsPaid(row);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 12px",
          borderRadius: "20px",
          fontSize: "12px",
          fontWeight: 600,
          backgroundColor: "#fef3c7",
          color: "#92400e",
          border: "1px solid #fcd34d",
          cursor: "pointer",
          transition: "all 0.2s",
          fontFamily: "inherit",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#fde68a";
          e.currentTarget.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#fef3c7";
          e.currentTarget.style.transform = "translateY(0)";
        }}
        title="Označi kao plaćeno"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#92400e"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        Naplati
      </button>
    );
  };

  return (
    <div id={id} style={containerStyle} className="table-wrapper">
      {title && (
        <h3 style={{ margin: 0, color: "#1e293b", fontSize: "18px" }}>
          {title}
        </h3>
      )}
      {tableSaving && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(255,255,255,0.7)",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "8px",
            backdropFilter: "blur(2px)",
          }}
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 44 44"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="22"
              cy="22"
              r="18"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="3.5"
            />
            <circle
              cx="22"
              cy="22"
              r="18"
              fill="none"
              stroke="#6366f1"
              strokeWidth="3.5"
              strokeDasharray="80 33"
              strokeLinecap="round"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 22 22"
                to="360 22 22"
                dur="0.7s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
        </div>
      )}

      {/* Action buttons row */}
      {(resolvedOptions.actionButtons || resolvedOptions.showExportButton) && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "8px",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          {/* Excel Export Button */}
          {resolvedOptions.showExportButton && (
            <button
              style={{
                padding: "8px 18px",
                background: "linear-gradient(135deg, #059669, #047857)",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "13px",
                boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)",
                letterSpacing: "0.01em",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontFamily: "inherit",
              }}
              type="button"
              title="Izvezi izveštaj u Excel"
              onClick={() => exportToExcel(dataBinding)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 16px rgba(5, 150, 105, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 12px rgba(5, 150, 105, 0.3)";
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Izvezi Excel
            </button>
          )}

          {/* Add button */}
          {resolvedOptions.actionButtons && (
            <button
              className="table-add-btn"
              style={{
                padding: "8px 18px",
                background: "linear-gradient(135deg, #6366f1, #7c3aed)",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "13px",
                boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
                letterSpacing: "0.01em",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontFamily: "inherit",
              }}
              type="button"
              title={`Add ${dataBinding?.entity || "Register"}`}
              onClick={() => {
                setModalMode("add");
                setEditRowData(null);
                setShowModal(true);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 16px rgba(99, 102, 241, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 12px rgba(99, 102, 241, 0.3)";
              }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <rect x="9" y="4" width="2" height="12" rx="1" fill="white" />
                <rect x="4" y="9" width="12" height="2" rx="1" fill="white" />
              </svg>
              {`+ Add ${dataBinding?.entity || "Register"}`}
            </button>
          )}
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal &&
        createPortal(
          <div
            className={`cal-modal-overlay ${paymentModalClosing ? "closing" : ""}`}
            onClick={closePaymentModal}
          >
            <div
              className={`cal-modal ${paymentModalClosing ? "closing" : ""}`}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "420px" }}
            >
              <div className="cal-modal-header">
                <h2>Označi kao plaćeno</h2>
                <button
                  type="button"
                  className="cal-modal-close"
                  onClick={closePaymentModal}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {paymentError && (
                <div className="table-modal-error">{paymentError}</div>
              )}

              <div className="cal-modal-body">
                {paymentRow && (
                  <div
                    style={{
                      background: "#f8fafc",
                      borderRadius: "10px",
                      padding: "14px 16px",
                      marginBottom: "16px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#1e293b",
                        marginBottom: "4px",
                      }}
                    >
                      {paymentRow.klijent_ime || "Sesija"}
                    </div>
                    <div style={{ fontSize: "13px", color: "#64748b" }}>
                      {formatCellValue(paymentRow.pocetak, "datetime")} —{" "}
                      {paymentRow.cena?.toLocaleString()} RSD
                    </div>
                  </div>
                )}

                <div className="table-form-group">
                  <label className="table-form-label">
                    Način plaćanja
                    <span className="table-form-required">*</span>
                  </label>
                  <div
                    style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                  >
                    {["gotovina", "kartica", "prenos"].map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() =>
                          setPaymentValues((pv) => ({
                            ...pv,
                            nacin_placanja: method,
                          }))
                        }
                        style={{
                          flex: 1,
                          minWidth: "80px",
                          padding: "10px 12px",
                          borderRadius: "10px",
                          border:
                            paymentValues.nacin_placanja === method
                              ? "2px solid #6366f1"
                              : "1.5px solid #e2e8f0",
                          background:
                            paymentValues.nacin_placanja === method
                              ? "linear-gradient(135deg, #eef2ff, #e0e7ff)"
                              : "#fff",
                          color:
                            paymentValues.nacin_placanja === method
                              ? "#4338ca"
                              : "#64748b",
                          fontWeight: 600,
                          fontSize: "13px",
                          cursor: "pointer",
                          transition: "all 0.2s",
                          fontFamily: "inherit",
                          textTransform: "capitalize",
                        }}
                      >
                        {method === "gotovina"
                          ? "💵 Gotovina"
                          : method === "kartica"
                            ? "💳 Kartica"
                            : "🏦 Prenos"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="table-form-group">
                  <label htmlFor="payment-date" className="table-form-label">
                    Datum uplate
                    <span className="table-form-required">*</span>
                  </label>
                  <input
                    id="payment-date"
                    type="date"
                    value={paymentValues.datum_uplate || ""}
                    onChange={(e) =>
                      setPaymentValues((pv) => ({
                        ...pv,
                        datum_uplate: e.target.value,
                      }))
                    }
                    className="table-form-input"
                  />
                </div>
              </div>

              <div className="cal-modal-footer">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className="cal-btn cal-btn-secondary"
                >
                  Otkaži
                </button>
                <button
                  type="button"
                  onClick={handlePaymentSubmit}
                  disabled={paymentSaving}
                  className="cal-btn cal-btn-primary"
                  style={{
                    background: "linear-gradient(135deg, #059669, #047857)",
                    opacity: paymentSaving ? 0.7 : 1,
                  }}
                >
                  {paymentSaving ? "Čuvanje..." : "✓ Potvrdi uplatu"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Main Add/Edit Modal */}
      {showModal &&
        createPortal(
          <div
            className={`cal-modal-overlay ${modalClosing ? "closing" : ""}`}
            onClick={closeModal}
          >
            <div
              className={`cal-modal ${modalClosing ? "closing" : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="cal-modal-header">
                <h2>
                  {modalMode === "edit"
                    ? `Edit ${dataBinding?.entity || "Register"}`
                    : `Add ${dataBinding?.entity || "Register"}`}
                </h2>
                <button
                  type="button"
                  className="cal-modal-close"
                  onClick={closeModal}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {validationError && (
                <div className="table-modal-error">{validationError}</div>
              )}

              <form
                onSubmit={async (e) => {
                  e.preventDefault();

                  const missingFields: string[] = [];
                  formColumns.forEach((col) => {
                    if (col.required) {
                      if (col.columnType === "session_type") {
                        const st = formValues["session_type"];
                        if (
                          st === "individualna" &&
                          !formValues["klijent_id"]
                        ) {
                          missingFields.push("Klijent");
                        }
                        if (st === "grupa" && !formValues["grupa_id"]) {
                          missingFields.push("Grupa");
                        }
                      } else if (col.columnType === "lookup") {
                        if (col.type === "list") {
                          const value = formValues[col.field];
                          if (
                            !value ||
                            (Array.isArray(value) && value.length === 0)
                          ) {
                            missingFields.push(col.label);
                          }
                        } else {
                          const value = formValues[col.field];
                          if (!value || value === "") {
                            missingFields.push(col.label);
                          }
                        }
                      } else if (col.columnType === "grupa_clanovi") {
                        // Not required
                      } else {
                        const value = formValues[col.field];
                        if (
                          value === undefined ||
                          value === null ||
                          value === ""
                        ) {
                          missingFields.push(col.label);
                        }
                      }
                    }
                  });

                  if (missingFields.length > 0) {
                    setValidationError(
                      `Popunite sledeća obavezna polja: ${missingFields.join(", ")}`,
                    );
                    return;
                  }

                  setValidationError("");
                  const endpoint = getEndpoint();
                  const backendBase =
                    import.meta.env.VITE_API_URL || "http://localhost:8000";

                  const processedValues: Record<string, any> = {};
                  formColumns.forEach((col) => {
                    if (col.columnType === "session_type") {
                      const st = formValues["session_type"];
                      if (st === "individualna") {
                        const kId = parseInt(formValues["klijent_id"], 10);
                        processedValues["klijent_id"] = isNaN(kId) ? null : kId;
                        processedValues["grupa_id"] = null;
                      } else {
                        const gId = parseInt(formValues["grupa_id"], 10);
                        processedValues["grupa_id"] = isNaN(gId) ? null : gId;
                        processedValues["klijent_id"] = null;
                      }
                    } else if (col.columnType === "grupa_clanovi") {
                      const value = formValues[col.field];
                      processedValues[col.field] = Array.isArray(value)
                        ? value
                            .map((v: string) => parseInt(v, 10))
                            .filter((v: number) => !isNaN(v))
                        : [];
                    } else if (col.columnType === "lookup" && col.path) {
                      if (col.type === "list") {
                        const value = formValues[col.field];
                        processedValues[col.path] = Array.isArray(value)
                          ? value
                              .map((v: string) => parseInt(v, 10))
                              .filter((v: number) => !isNaN(v))
                          : [];
                      } else {
                        const value = formValues[col.field];
                        processedValues[col.path] =
                          value && value !== "" ? parseInt(value, 10) : null;
                      }
                    } else {
                      const value = formValues[col.field];
                      if (col.type === "list") {
                        processedValues[col.field] =
                          typeof value === "string"
                            ? value
                                .split(",")
                                .map((item: string) => item.trim())
                                .filter((item: string) => item !== "")
                            : Array.isArray(value)
                              ? value
                              : [];
                      } else if (col.type === "int") {
                        const intValue = parseInt(value, 10);
                        processedValues[col.field] = isNaN(intValue)
                          ? 0
                          : intValue;
                      } else if (col.type === "float") {
                        const floatValue = parseFloat(value);
                        processedValues[col.field] = isNaN(floatValue)
                          ? 0
                          : floatValue;
                      } else if (
                        col.type === "bool" ||
                        col.type === "boolean"
                      ) {
                        processedValues[col.field] = Boolean(value);
                      } else {
                        processedValues[col.field] = value;
                      }
                    }
                  });

                  closeModal();
                  setTableSaving(true);

                  try {
                    if (modalMode === "add") {
                      const url = endpoint.startsWith("/")
                        ? backendBase + endpoint
                        : endpoint;
                      await axios.post(url, processedValues);
                    } else if (modalMode === "edit") {
                      const rowId = getRowId(editRowData);
                      const url = endpoint.replace(/\/$/, "");
                      const fullUrl = url.startsWith("/")
                        ? `${backendBase}${url}/${rowId}/`
                        : `${url}/${rowId}/`;
                      await axios.put(fullUrl, processedValues);
                    }
                    await fetchTableData();
                  } catch (err) {
                    console.error("Error saving data:", err);
                    if (axios.isAxiosError(err) && err.response) {
                      const detail = err.response.data?.detail;
                      if (detail) {
                        setShowModal(true);
                        if (Array.isArray(detail)) {
                          setValidationError(
                            detail
                              .map(
                                (e: any) =>
                                  `${e.loc?.[e.loc.length - 1] || "field"}: ${e.msg}`,
                              )
                              .join("; "),
                          );
                        } else if (typeof detail === "string") {
                          setValidationError(detail);
                        } else {
                          setValidationError(JSON.stringify(detail));
                        }
                      }
                    }
                    await fetchTableData();
                  } finally {
                    setTableSaving(false);
                  }
                }}
                className="table-modal-form"
              >
                <div className="cal-modal-body">
                  {formColumns.map((col) => renderFormField(col))}
                </div>

                <div className="cal-modal-footer">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="cal-btn cal-btn-secondary"
                  >
                    Otkaži
                  </button>
                  <button type="submit" className="cal-btn cal-btn-primary">
                    Sačuvaj
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {normalizedRows.length === 0 || columns.length === 0 ? (
        <div className="table-empty">
          No data available for{" "}
          {dataBinding?.entity ? `${dataBinding.entity}` : "this table"}.
        </div>
      ) : (
        <div className="table-scroll">
          <table style={tableStyle}>
            {resolvedOptions.showHeader && (
              <thead>
                <tr style={{ backgroundColor: "#1e293b", color: "#ffffff" }}>
                  {columns.map((column) => (
                    <th
                      key={`${id}-${column.field}`}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        fontWeight: 600,
                        letterSpacing: "0.01em",
                      }}
                    >
                      {column.type === "payment_status" ? (
                        <span>{column.label}</span>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span>{column.label}</span>
                          <ColumnSort
                            column={column}
                            currentSort={sortConfig}
                            onSortChange={handleSortChange}
                          />
                          <ColumnFilter
                            column={column}
                            onFilterChange={handleFilterChange}
                            currentValue={columnFilters[column.field] || ""}
                          />
                        </div>
                      )}
                    </th>
                  ))}
                  {resolvedOptions.actionButtons && (
                    <th
                      style={{
                        textAlign: "center",
                        padding: "10px 4px",
                        fontWeight: 600,
                        width: "70px",
                        minWidth: "70px",
                        maxWidth: "70px",
                        overflow: "hidden",
                      }}
                    ></th>
                  )}
                </tr>
              </thead>
            )}
            <tbody>
              {visibleRows.map((row, rowIndex) => {
                const actualRowIndex = (currentPage - 1) * pageSize + rowIndex;
                const isSelected = selectedRowIndex === actualRowIndex;
                const isPaid = row.placeno === true;

                return (
                  <tr
                    key={`${id}-row-${rowIndex}`}
                    onClick={() => {
                      setSelectedRowIndex(actualRowIndex);
                      setSelectedRow(id, row);
                    }}
                    className="table-row"
                    style={{
                      backgroundColor: isSelected
                        ? "#dbeafe"
                        : isPaid
                          ? "#f0fdf4"
                          : resolvedOptions.stripedRows && rowIndex % 2 === 1
                            ? "#f8fafc"
                            : "#ffffff",
                      borderBottom: "1px solid #e2e8f0",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = isPaid
                          ? "#dcfce7"
                          : "#f1f5f9";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = isPaid
                          ? "#f0fdf4"
                          : resolvedOptions.stripedRows && rowIndex % 2 === 1
                            ? "#f8fafc"
                            : "#ffffff";
                      }
                    }}
                  >
                    {columns.map((column) => {
                      // Payment status column - special rendering
                      if (column.type === "payment_status") {
                        return (
                          <td
                            key={`${id}-row-${rowIndex}-cell-${column.field}`}
                            style={{ padding: "10px 12px" }}
                          >
                            {renderPaymentStatusCell(row)}
                          </td>
                        );
                      }

                      let cellValue;
                      if (
                        column.columnType === "lookup" &&
                        column.lookupField
                      ) {
                        if (column.type === "list") {
                          const relatedArray = row[column.field];
                          if (
                            Array.isArray(relatedArray) &&
                            column.lookupField
                          ) {
                            cellValue = relatedArray
                              .map((item) => item[column.lookupField!])
                              .filter(
                                (val) => val !== null && val !== undefined,
                              )
                              .join(", ");
                          } else {
                            cellValue = "";
                          }
                        } else {
                          if (column.relationshipKey) {
                            const nestedPath = `${column.relationshipKey}.${column.lookupField}`;
                            cellValue = getNestedValue(row, nestedPath);
                          }
                          if (!cellValue) {
                            const nestedPath = `${column.field}.${column.lookupField}`;
                            cellValue = getNestedValue(row, nestedPath);
                          }
                        }
                      } else {
                        cellValue = row[column.field];
                      }

                      return (
                        <td
                          key={`${id}-row-${rowIndex}-cell-${column.field}`}
                          style={{
                            padding: "10px 12px",
                            color: "#1f2937",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                            overflow: "hidden",
                            maxWidth: "200px",
                          }}
                          title={formatCellValue(cellValue, column.type)}
                        >
                          {column.field === "status" ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 12px",
                                borderRadius: "20px",
                                fontSize: "12px",
                                fontWeight: 600,
                                backgroundColor:
                                  cellValue === "zakazano"
                                    ? "#dbeafe"
                                    : cellValue === "zavrseno"
                                      ? "#dcfce7"
                                      : cellValue === "otkazano"
                                        ? "#fee2e2"
                                        : "#f3f4f6",
                                color:
                                  cellValue === "zakazano"
                                    ? "#1e40af"
                                    : cellValue === "zavrseno"
                                      ? "#166534"
                                      : cellValue === "otkazano"
                                        ? "#991b1b"
                                        : "#374151",
                              }}
                            >
                              {cellValue === "zakazano"
                                ? "Zakazano"
                                : cellValue === "zavrseno"
                                  ? "Završeno"
                                  : cellValue === "otkazano"
                                    ? "Otkazano"
                                    : formatCellValue(cellValue, column.type)}
                            </span>
                          ) : (
                            formatCellValue(cellValue, column.type)
                          )}
                        </td>
                      );
                    })}
                    {resolvedOptions.actionButtons && (
                      <td
                        style={{
                          textAlign: "center",
                          padding: "10px 2px",
                          width: "70px",
                          minWidth: "70px",
                          maxWidth: "70px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "row",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: "2px",
                            width: "100%",
                          }}
                        >
                          <button
                            className="table-action-btn table-action-edit"
                            type="button"
                            title="Edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalMode("edit");
                              setEditRowData(row);
                              setShowModal(true);
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                            </svg>
                          </button>
                          <button
                            className="table-action-btn table-action-delete"
                            type="button"
                            title="Remove"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const endpoint = getEndpoint();
                              const rowId = getRowId(row);
                              const url = endpoint.replace(/\/$/, "");
                              const backendBase =
                                import.meta.env.VITE_API_URL ||
                                "http://localhost:8000";
                              const fullUrl = url.startsWith("/")
                                ? `${backendBase}${url}/${rowId}/`
                                : `${url}/${rowId}/`;

                              setTableData((prev) =>
                                prev.filter((r) => getRowId(r) !== rowId),
                              );

                              try {
                                await axios.delete(fullUrl);
                                await fetchTableData();
                              } catch (err) {
                                console.error("Error deleting data:", err);
                                await fetchTableData();
                              }
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m5 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resolvedOptions.showPagination && filteredRows.length > 0 && (
        <div className="table-pagination">
          <span>
            Showing {visibleRows.length} of {sortedAndFilteredRows.length} rows
            {Object.keys(columnFilters).length > 0 && (
              <span className="table-pagination-filtered">
                (filtered from {normalizedRows.length})
              </span>
            )}
          </span>
          <div className="table-pagination-controls">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="table-pagination-btn"
            >
              Prev
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              className="table-pagination-btn"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
