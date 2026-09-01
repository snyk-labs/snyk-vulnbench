package userapp

import (
	"context"

	"github.com/jmoiron/sqlx"
)

func searchUsersByDepartment(ctx context.Context, db *sqlx.DB, department string) ([]userRow, error) {
	query := "SELECT user_id, name, email, department, enabled FROM users WHERE department = '" + department + "'"

	rows, err := db.QueryxContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []userRow
	for rows.Next() {
		var u userRow
		if err := rows.StructScan(&u); err != nil {
			return nil, err
		}
		results = append(results, u)
	}

	return results, nil
}
