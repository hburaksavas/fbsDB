// Built-in live templates; placeholders use Monaco snippet syntax and nothing is executed on expansion.
export const sqlSnippets = [
  { trigger: "sel", label: "SELECT query", detail: "SELECT columns with a FROM and WHERE clause", text: "SELECT ${1:column_list}\nFROM ${2:table_name}\nWHERE ${3:condition};" },
  { trigger: "seltop", label: "SELECT · first rows", detail: "Oracle FETCH FIRST row limit", text: "SELECT *\nFROM ${1:table_name}\nFETCH FIRST ${2:100} ROWS ONLY;" },
  { trigger: "ins", label: "INSERT row", detail: "Parameterized INSERT statement", text: "INSERT INTO ${1:table_name} (${2:column})\nVALUES (:${3:value});" },
  { trigger: "upd", label: "UPDATE row", detail: "Parameterized UPDATE with a WHERE clause", text: "UPDATE ${1:table_name}\nSET ${2:column} = :${3:value}\nWHERE ${4:id_column} = :${5:id};" },
  { trigger: "del", label: "DELETE row", detail: "Parameterized DELETE with a WHERE clause", text: "DELETE FROM ${1:table_name}\nWHERE ${2:id_column} = :${3:id};" },
  { trigger: "cte", label: "Common table expression", detail: "WITH query and outer SELECT", text: "WITH ${1:query_name} AS (\n    SELECT ${2:column}\n    FROM ${3:table_name}\n)\nSELECT *\nFROM ${1:query_name};" },
  { trigger: "with", label: "WITH query", detail: "Common table expression with an outer SELECT", text: "WITH ${1:query_name} AS (\n    SELECT ${2:column}\n    FROM ${3:table_name}\n)\nSELECT *\nFROM ${1:query_name};" },
  { trigger: "wim", label: "WITH · multiple tables", detail: "Two table CTEs joined in an outer SELECT", text: "WITH ${1:first_cte} AS (\n    SELECT ${2:column_list}\n    FROM ${3:first_table}\n),\n${4:second_cte} AS (\n    SELECT ${5:column_list}\n    FROM ${6:second_table}\n)\nSELECT ${7:column_list}\nFROM ${1:first_cte} a\nINNER JOIN ${4:second_cte} b\n    ON ${8:a.key_column = b.key_column};" },
  { trigger: "daterange", label: "Date range predicate", detail: "Half-open Oracle date range with bind variables", text: "${1:date_column} >= :${2:from_date}\nAND ${1:date_column} < :${3:to_date}" },
  { trigger: "plblock", label: "PL/SQL block", detail: "Anonymous PL/SQL declaration, body and exception handler", text: "DECLARE\n    ${1:variable_name} ${2:NUMBER};\nBEGIN\n    ${3:NULL;}\nEXCEPTION\n    WHEN OTHERS THEN\n        RAISE;\nEND;\n/" },
  { trigger: "plif", label: "PL/SQL IF", detail: "Conditional PL/SQL block", text: "IF ${1:condition} THEN\n    ${2:NULL;}\nEND IF;" },
  { trigger: "plfor", label: "PL/SQL FOR loop", detail: "Numeric PL/SQL FOR loop", text: "FOR ${1:i} IN ${2:1} .. ${3:10} LOOP\n    ${4:NULL;}\nEND LOOP;" },
  { trigger: "plcase", label: "CASE expression", detail: "SQL or PL/SQL searched CASE expression", text: "CASE\n    WHEN ${1:condition} THEN ${2:value}\n    ELSE ${3:fallback}\nEND" },
  { trigger: "proc", label: "PL/SQL procedure", detail: "Standalone procedure with parameters and an exception handler", text: "CREATE OR REPLACE PROCEDURE ${1:procedure_name} (\n    ${2:p_id} IN ${3:NUMBER}\n) IS\nBEGIN\n    ${4:NULL;}\nEXCEPTION\n    WHEN OTHERS THEN\n        RAISE;\nEND ${1:procedure_name};\n/" },
  { trigger: "func", label: "PL/SQL function", detail: "Standalone function returning a value", text: "CREATE OR REPLACE FUNCTION ${1:function_name} (\n    ${2:p_id} IN ${3:NUMBER}\n) RETURN ${4:NUMBER} IS\n    ${5:l_result} ${4:NUMBER};\nBEGIN\n    ${6:NULL;}\n    RETURN ${5:l_result};\nEND ${1:function_name};\n/" },
  { trigger: "cursor", label: "Explicit cursor loop", detail: "Cursor declaration with OPEN, FETCH and CLOSE", text: "DECLARE\n    CURSOR ${1:c_rows} IS\n        SELECT ${2:column_list}\n        FROM ${3:table_name};\n    ${4:r_row} ${1:c_rows}%ROWTYPE;\nBEGIN\n    OPEN ${1:c_rows};\n    LOOP\n        FETCH ${1:c_rows} INTO ${4:r_row};\n        EXIT WHEN ${1:c_rows}%NOTFOUND;\n        ${5:NULL;}\n    END LOOP;\n    CLOSE ${1:c_rows};\nEND;" },
  { trigger: "curfor", label: "Cursor FOR loop", detail: "Implicit cursor FOR loop over a query", text: "FOR ${1:rec} IN (\n    SELECT ${2:column_list}\n    FROM ${3:table_name}\n) LOOP\n    ${4:NULL;}\nEND LOOP;" },
  { trigger: "exc", label: "Exception handler", detail: "Named and fallback exception handlers", text: "EXCEPTION\n    WHEN ${1:NO_DATA_FOUND} THEN\n        ${2:NULL;}\n    WHEN OTHERS THEN\n        ${3:RAISE;}" },
  { trigger: "raise", label: "RAISE_APPLICATION_ERROR", detail: "Application error in the -20000..-20999 range", text: "RAISE_APPLICATION_ERROR(${1:-20001}, '${2:message}');" },
  { trigger: "pkg", label: "Package specification", detail: "Package specification with one public procedure", text: "CREATE OR REPLACE PACKAGE ${1:package_name} AS\n    PROCEDURE ${2:procedure_name};\nEND ${1:package_name};\n/" },
  { trigger: "pkgb", label: "Package body", detail: "Package body implementing one procedure", text: "CREATE OR REPLACE PACKAGE BODY ${1:package_name} AS\n    PROCEDURE ${2:procedure_name} IS\n    BEGIN\n        ${3:NULL;}\n    END ${2:procedure_name};\nEND ${1:package_name};\n/" },
];

// Added after custom snippets existed; a saved custom snippet with one of these triggers keeps precedence.
export const overridableSnippetTriggers = new Set(['proc', 'func', 'cursor', 'curfor', 'exc', 'raise', 'pkg', 'pkgb']);
