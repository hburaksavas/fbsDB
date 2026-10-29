using System.Globalization;
using System.IO.Compression;
using System.Xml;

namespace FbsDb.Services;
public static class ResultXlsxExporter
{
    private static string ColumnName(int index) { var name=""; for(index++;index>0;index=(index-1)/26) name=(char)('A'+(index-1)%26)+name; return name; }
    private static string Clean(string value) => string.Concat(value.Where(ch=>XmlConvert.IsXmlChar(ch)));
    public static void Write(Stream output, IReadOnlyList<SqlColumn> columns, IEnumerable<object?[]> rows, CancellationToken token=default,bool includeMetadata=false)
    {
        using var archive=new ZipArchive(output,ZipArchiveMode.Create,true);
        void Entry(string path,string xml) { using var writer=new StreamWriter(archive.CreateEntry(path).Open());writer.Write(xml); }
        Entry("[Content_Types].xml","<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>".Replace("</Types>",includeMetadata?"<Override PartName=\"/xl/worksheets/sheet2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>":"</Types>"));
        Entry("_rels/.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
        Entry("xl/workbook.xml","<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Results\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>".Replace("</sheets>",includeMetadata?"<sheet name=\"Metadata\" sheetId=\"2\" r:id=\"rId3\"/></sheets>":"</sheets>"));
        Entry("xl/_rels/workbook.xml.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>".Replace("</Relationships>",includeMetadata?"<Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet2.xml\"/></Relationships>":"</Relationships>"));
        Entry("xl/styles.xml","<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"yyyy-mm-dd hh:mm:ss\"/></numFmts><fonts count=\"1\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts><fills count=\"2\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill></fills><borders count=\"1\"><border/></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"2\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/><xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\"/></cellXfs></styleSheet>");
        using var xml=XmlWriter.Create(archive.CreateEntry("xl/worksheets/sheet1.xml").Open(),new XmlWriterSettings{Encoding=new System.Text.UTF8Encoding(false),CloseOutput=true});
        xml.WriteStartElement("worksheet","http://schemas.openxmlformats.org/spreadsheetml/2006/main");xml.WriteStartElement("sheetViews");xml.WriteStartElement("sheetView");xml.WriteAttributeString("workbookViewId","0");xml.WriteStartElement("pane");xml.WriteAttributeString("ySplit","1");xml.WriteAttributeString("topLeftCell","A2");xml.WriteAttributeString("state","frozen");xml.WriteEndElement();xml.WriteEndElement();xml.WriteEndElement();xml.WriteStartElement("sheetData");
        int rowIndex=0;
        void Row(object?[] row,bool header=false) {
            token.ThrowIfCancellationRequested();rowIndex++;if(rowIndex>1048576)throw new InvalidOperationException("Excel supports at most 1,048,575 data rows per sheet. Export CSV instead.");
            xml.WriteStartElement("row");xml.WriteAttributeString("r",rowIndex.ToString(CultureInfo.InvariantCulture));
            for(int i=0;i<columns.Count;i++) {
                var value=i<row.Length?row[i]:null;if(value is null)continue;
                var text=Convert.ToString(value,CultureInfo.InvariantCulture)??"";
                var numeric=!header&&System.Text.RegularExpressions.Regex.IsMatch(columns[i].Type,"NUMBER|INT|DECIMAL|FLOAT|DOUBLE|REAL",System.Text.RegularExpressions.RegexOptions.IgnoreCase)&&decimal.TryParse(text,NumberStyles.Float,CultureInfo.InvariantCulture,out _)&&text.Count(char.IsDigit)<=15;
                var preciseTemporal=value is OracleTemporalCell temporal&&(temporal.OracleType.Contains("TIME ZONE",StringComparison.Ordinal)||System.Text.RegularExpressions.Regex.IsMatch(temporal.Value,@"\.\d*[1-9]"));
                var date=!header&&!preciseTemporal&&!columns[i].Type.Contains("TIME ZONE",StringComparison.OrdinalIgnoreCase)&&System.Text.RegularExpressions.Regex.IsMatch(columns[i].Type,"DATE|TIMESTAMP",System.Text.RegularExpressions.RegexOptions.IgnoreCase)&&DateTime.TryParse(text,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out var parsedDate)&&parsedDate>=new DateTime(1900,3,1);
                xml.WriteStartElement("c");xml.WriteAttributeString("r",ColumnName(i)+rowIndex);
                if(date){xml.WriteAttributeString("s","1");xml.WriteElementString("v",DateTime.Parse(text,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind).ToOADate().ToString(CultureInfo.InvariantCulture));}
                else if(numeric)xml.WriteElementString("v",text);
                else{xml.WriteAttributeString("t","inlineStr");xml.WriteStartElement("is");xml.WriteStartElement("t");xml.WriteAttributeString("xml","space",null,"preserve");xml.WriteString(Clean(text));xml.WriteEndElement();xml.WriteEndElement();}
                xml.WriteEndElement();
            }
            xml.WriteEndElement();
        }
        Row(columns.Select(c=>(object?)c.Name).ToArray(),true);foreach(var row in rows)Row(row);xml.WriteEndElement();xml.WriteEndElement();
        xml.Dispose();
        if(includeMetadata){
            using var meta=XmlWriter.Create(archive.CreateEntry("xl/worksheets/sheet2.xml").Open(),new XmlWriterSettings{Encoding=new System.Text.UTF8Encoding(false),CloseOutput=true});
            const string ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";meta.WriteStartElement("worksheet",ns);meta.WriteStartElement("sheetData",ns);
            void MetadataRow(IEnumerable<object?> values){meta.WriteStartElement("row",ns);foreach(var value in values){meta.WriteStartElement("c",ns);meta.WriteAttributeString("t","inlineStr");meta.WriteStartElement("is",ns);meta.WriteElementString("t",ns,Clean(Convert.ToString(value,CultureInfo.InvariantCulture)??""));meta.WriteEndElement();meta.WriteEndElement();}meta.WriteEndElement();}
            MetadataRow(["Position","Name","Type","Size","Precision","Scale","Nullable","Schema","Table","SourceColumn"]);
            for(var i=0;i<columns.Count;i++){var c=columns[i];MetadataRow([i+1,c.Name,c.Type,c.Size,c.Precision,c.Scale,c.Nullable,c.SourceSchema,c.SourceTable,c.SourceColumn]);}
            meta.WriteEndElement();meta.WriteEndElement();
        }

    }
}
