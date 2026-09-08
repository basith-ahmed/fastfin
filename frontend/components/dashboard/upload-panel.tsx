import { UploadZone } from "@/components/documents/upload-zone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function UploadPanel() {
  return (
    <Card id="upload" className="scroll-mt-6 shadow-none">
      <CardHeader>
        <CardTitle>Upload a report</CardTitle>
        <p className="text-sm text-muted-foreground">
          Processing begins automatically after validation.
        </p>
      </CardHeader>
      <CardContent>
        <UploadZone />
      </CardContent>
    </Card>
  );
}
