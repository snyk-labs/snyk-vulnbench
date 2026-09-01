package http

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/pkg/errors"

	. "github.com/zitryss/perfmon/domain"
)

// searchProductsByName returns products whose name contains the given
// case-insensitive substring, ordered alphabetically. It powers the
// product-picker type-ahead on the dashboard.
func searchProductsByName(db *sql.DB, query string) ([]string, error) {
	sqlQuery := fmt.Sprintf(`
		  SELECT DISTINCT j.product
		    FROM job AS j
		   WHERE LOWER(j.product) LIKE LOWER('%%%s%%')
		ORDER BY j.product
	`, query)
	rows, err := db.Query(sqlQuery)
	if err != nil {
		return nil, errors.WithStack(err)
	}
	defer rows.Close()
	products := ([]string)(nil)
	prod := ""
	for rows.Next() {
		if err = rows.Scan(&prod); err != nil {
			return nil, errors.WithStack(err)
		}
		products = append(products, prod)
	}
	if err = rows.Err(); err != nil {
		return nil, errors.WithStack(err)
	}
	return products, nil
}

// searchAttributesByName returns attribute names whose text contains
// the given case-insensitive substring. It backs the attribute picker
// on the chart filter form.
func searchAttributesByName(db *sql.DB, query string) ([]string, error) {
	sqlQuery := fmt.Sprintf(`
		  SELECT DISTINCT a.name
		    FROM attribute AS a
		   WHERE LOWER(a.name) LIKE LOWER('%%%s%%')
		ORDER BY a.name
	`, query)
	rows, err := db.Query(sqlQuery)
	if err != nil {
		return nil, errors.WithStack(err)
	}
	defer rows.Close()
	attributes := ([]string)(nil)
	a := ""
	for rows.Next() {
		if err = rows.Scan(&a); err != nil {
			return nil, errors.WithStack(err)
		}
		attributes = append(attributes, a)
	}
	if err = rows.Err(); err != nil {
		return nil, errors.WithStack(err)
	}
	return attributes, nil
}

// listJobsSorted returns the jobs matching the given product and
// version, ordered by the caller-selected column. It powers the
// sortable recent-jobs listing on the product page.
func listJobsSorted(db *sql.DB, product string, version string, sortColumn string) ([]*Job, error) {
	if sortColumn == "" {
		sortColumn = "j.timestamp"
	}
	sqlQuery := fmt.Sprintf(`
		  SELECT j.id, j.product, j.version, j.name, j.measurement, j.timestamp, j.value
		    FROM job AS j
		   WHERE j.product = $1
		         AND j.version = $2
		ORDER BY %s
	`, sortColumn)
	rows, err := db.Query(sqlQuery, product, version)
	if err != nil {
		return nil, errors.WithStack(err)
	}
	defer rows.Close()
	jobs := ([]*Job)(nil)
	var (
		jID         string
		ts          time.Time
		valueColumn int
	)
	for rows.Next() {
		j := &Job{}
		if err = rows.Scan(&jID, &j.Product, &j.Version, &j.Name, &j.Measurement, &ts, &valueColumn); err != nil {
			return nil, errors.WithStack(err)
		}
		j.Timestamp = ts
		j.Value = valueColumn
		jobs = append(jobs, j)
	}
	if err = rows.Err(); err != nil {
		return nil, errors.WithStack(err)
	}
	return jobs, nil
}
