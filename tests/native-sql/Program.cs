using FbsDb.Services;

static void Require(bool condition, string scenario) { if (!condition) throw new Exception(scenario); }
Require(OracleSqlUnit.Normalize("BEGIN NULL; END;\n/") == "BEGIN NULL; END;", "Anonymous PL/SQL keeps its final semicolon and drops the client slash.");
Require(OracleSqlUnit.Normalize("-- header\nDECLARE x NUMBER; BEGIN NULL; END;").EndsWith("END;"), "Leading comments preserve block detection.");
Require(OracleSqlUnit.Normalize("CREATE OR REPLACE PACKAGE BODY p AS BEGIN NULL; END;").EndsWith("END;"), "Package bodies keep terminators.");
Require(!OracleSqlUnit.Normalize("SELECT ';' FROM dual; -- note").Contains("dual;"), "Trailing SQL semicolon is removed before a comment.");
Require(OracleSqlUnit.Normalize("SELECT ';' FROM dual;").Contains("';'"), "Literal semicolons are not changed.");
Require(OracleSqlUnit.Normalize("<<outer>> BEGIN NULL; END outer;").EndsWith("outer;"), "Labeled blocks keep the terminator.");
var target = OracleSqlUnit.CompilationTarget("CREATE /* header */ OR REPLACE EDITIONABLE PACKAGE BODY \"App\".\"InvoicePkg\" AS END;");
Require(target is { Owner: "App", Name: "InvoicePkg", Type: "PACKAGE BODY" }, "Compilation targets preserve quoted identities.");
Require(OracleSqlUnit.CompilationTarget("ALTER PACKAGE app.billing COMPILE BODY") is { Owner: "APP", Name: "BILLING", Type: "PACKAGE BODY" }, "Explicit body compilation targets the body.");
Require(OracleSqlUnit.CompilationTarget("BEGIN NULL; END;") is null, "Anonymous blocks never query unrelated stored-object diagnostics.");
Require(OracleSqlUnit.RequiresManualTransaction("BEGIN UPDATE t SET c=1; END;"), "PL/SQL work uses a manual transaction.");
Require(!OracleSqlUnit.RequiresManualTransaction("CREATE FUNCTION p RETURN NUMBER AS BEGIN RETURN 1; END;"), "DDL is not placed in a client transaction.");
Console.WriteLine("11 native SQL normalization and compilation target checks passed.");
Require(OracleNlsSettings.Validate(new Dictionary<string,string>{{"NLS_LANGUAGE","turkish"},{"NLS_NUMERIC_CHARACTERS",",."},{"SESSIONTIMEZONE","Europe/Istanbul"}})["NLS_LANGUAGE"]=="TURKISH","NLS names use invariant normalization.");
foreach(var entry in new[]{("NLS_LANG","TURKISH"),("NLS_LENGTH_SEMANTICS","CHAR"),("SESSIONTIMEZONE","+15:00"),("NLS_NUMERIC_CHARACTERS","11"),("NLS_LANGUAGE","AMERICAN; DROP USER T")}){
 var rejected=false;try{OracleNlsSettings.Validate(new Dictionary<string,string>{{entry.Item1,entry.Item2}});}catch(InvalidOperationException){rejected=true;}
 Require(rejected,"Invalid or unsupported NLS option rejected: "+entry.Item1);
}
Require(OracleNlsSettings.Statement("SESSIONTIMEZONE","+03:00")=="ALTER SESSION SET TIME_ZONE = '+03:00'","Session timezone maps to a fixed SQL parameter.");
Require(OracleNlsSettings.Statement("NLS_DATE_FORMAT","YYYY-MM-DD' literal").Contains("DD'' literal'"),"NLS values cannot terminate the SQL string literal.");
Console.WriteLine("NLS allowlist, timezone, numeric characters and literal escaping checks passed.");
