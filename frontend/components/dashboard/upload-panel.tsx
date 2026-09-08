import { UploadZone } from "@/components/documents/upload-zone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function UploadPanel() {
  return (
    <Card id="upload" className="scroll-mt-24 border-blue-100 bg-blue-50/35 shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Upload PDF</CardTitle>
      </CardHeader>
      <CardContent>
        <UploadZone />
      </CardContent>
    </Card>
  );
}
