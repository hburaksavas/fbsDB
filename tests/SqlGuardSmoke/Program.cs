using FbsDb.Services;

static void Reject(Action action) { try { action(); } catch (InvalidOperationException) { return; } throw new Exception("Expected SELECT rejection."); }
foreach (var sql in new[] { "select :id from dual; -- end", "with a as (select :id id from dual) select * from a", "select q'[delete; ( :hidden)]' text, \"UPDATE\" from dual", "select nq'{insert;}' from dual" }) SelectOnlyGuard.AssertSelect(sql);
foreach (var sql in new[] { "delete from t", "select 1 from dual; delete from t", "with a as (select 1 from dual) update t set n=1", "select * from t for update", "select n into :n from t", "begin null; end;", "select 'oops", "select (1 from dual", "select 1) from dual", "select 1 from dual;;" }) Reject(() => SelectOnlyGuard.AssertSelect(sql));
foreach (var good in new[] { "UPDATE \"APP\".\"T\" SET \"A\" = :c1 WHERE \"ID\" = :uk1", "DELETE FROM \"T\" WHERE \"ID\" = :dk1", "INSERT INTO \"APP\".\"T\" (\"A\") VALUES (:i1)" }) GridDmlGuard.Assert(good);
foreach (var bad in new[] { "", "SELECT 1 FROM dual", "DROP TABLE \"T\"", "UPDATE T SET A = 1", "DELETE FROM \"T\" WHERE \"ID\" = :a; DELETE FROM \"U\" WHERE 1=1", "UPDATE \"T\" SET \"A\" = 1 -- x", "BEGIN NULL; END;" })
    Reject(() => GridDmlGuard.Assert(bad));
Console.WriteLine("PASS SELECT classification and grid DML classification.");
