CREATE TABLE employees (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT,
    salary INTEGER,
    hire_date TEXT
);

INSERT INTO employees (name, department, salary, hire_date) VALUES 
    ('John Doe', 'Engineering', 85000, '2020-01-15'),
    ('Jane Smith', 'Marketing', 72000, '2019-03-22'),
    ('Bob Johnson', 'Engineering', 92000, '2018-07-10'),
    ('Alice Brown', 'HR', 65000, '2021-09-05'),
    ('Charlie Wilson', 'Sales', 78000, '2020-11-30');

CREATE TABLE departments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    manager TEXT,
    budget INTEGER
);

INSERT INTO departments (name, manager, budget) VALUES 
    ('Engineering', 'Sarah Connor', 500000),
    ('Marketing', 'Mike Davis', 200000),
    ('HR', 'Lisa Zhang', 150000),
    ('Sales', 'Tom Anderson', 300000);
