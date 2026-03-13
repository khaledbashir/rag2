export default function NewEstimateLoading() {
    return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
            <div className="w-full max-w-sm rounded-xl border border-border bg-background/90 p-6 shadow-sm text-center">
                <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-border border-t-[#0A52EF] animate-spin" />
                <h1 className="text-sm font-semibold">Creating estimate...</h1>
                <p className="mt-2 text-xs text-muted-foreground">
                    Setting up the workbook and saving your new estimate.
                </p>
            </div>
        </div>
    );
}
