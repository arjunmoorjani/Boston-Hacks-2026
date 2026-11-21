-- The original CHECK rejects NULL because lower(NULL) IS NOT NULL is false.
-- Allow unknown ages while keeping the existing rules for supplied ranges.

BEGIN;

ALTER TABLE public.popular_routes
    DROP CONSTRAINT popular_routes_recommended_age_range_check,
    ADD CONSTRAINT popular_routes_recommended_age_range_check
        CHECK (
            recommended_age_range IS NULL
            OR (
                NOT isempty(recommended_age_range)
                AND lower(recommended_age_range) IS NOT NULL
                AND lower(recommended_age_range) >= 0
            )
        );

COMMIT;
