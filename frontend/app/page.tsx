import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-6 py-16">
      <Card className="w-full max-w-2xl shadow-none">
        <CardHeader className="space-y-5">
          <Badge variant="secondary" className="w-fit">
            Foundation ready
          </Badge>
          <div className="space-y-3">
            <h1 className="font-heading text-4xl font-medium tracking-tight sm:text-5xl">
              FastFin
            </h1>
            <p className="max-w-xl text-lg leading-8 text-muted-foreground">
              Evidence-grounded PDF fact intelligence
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <Separator className="mb-6" />
          <p className="max-w-xl leading-7 text-muted-foreground">
            The application foundation is running. Document intelligence will be added in later
            implementation phases.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
